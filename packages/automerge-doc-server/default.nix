{
  pkgs,
  inputs,
  self,
  ...
}:
let
  packageJson = builtins.fromJSON (builtins.readFile ./package.json);
  name = packageJson.name;
  version = packageJson.version;

  pkgsUnstable = import inputs.nixpkgsUnstable {
    system = "x86_64-linux";
  };
in
pkgs.stdenv.mkDerivation {
  pname = name;
  version = version;
  src = ./.;

  nativeBuildInputs = with pkgs; [
    pnpm_9.configHook
    esbuild
    makeWrapper
  ];

  buildInputs = with pkgs; [
    nodejs_24
  ];

  # package.json expects notebook-types to be at ../notebook-types, we COULD modify the parent of the nix
  # `build` directory, but this is technically unsupported. Instead we recreate part of the `packages`
  # directory structure in a way familiar to pnpm.
  unpackPhase = ''
    mkdir -p ./notebook-types/dist/pkg-node
    cp -r ${self.packages.x86_64-linux.notebook-types-node}/* ./notebook-types/dist/pkg-node/

    mkdir ./automerge-doc-server
    cp -r $src/* ./automerge-doc-server

    cd automerge-doc-server
  '';

  installPhase = ''
    # We use esbuild instead of tsc for building, as it bundles all required JavaScript into a single
    # file. This avoids copying the entire ~200MB node_modules directory to the remote machine during deployments.
    ${pkgs.lib.getExe pkgs.esbuild} src/main.ts --bundle --platform=node --format=cjs --loader:.wasm=file --outfile=$out/main.cjs

    # Since we are no longer copying the entire node_modules directory, we need to manually find and copy
    # the wasm file for automerge
    automerge_wasm_path=$(find node_modules/.pnpm -path "*/wasm_bindgen_output/nodejs/automerge_wasm_bg.wasm" 2>/dev/null | head -n 1)
    if [ -z "$automerge_wasm_path" ]; then
      echo "❌ Error: Node.js automerge WASM file not found!"
      exit 1
    fi

    cp "${self.packages.x86_64-linux.notebook-types-node}/notebook_types_bg.wasm" "$out/"
    cp "$automerge_wasm_path" "$out/"

    mkdir -p $out/bin
    makeWrapper ${pkgs.nodejs_24}/bin/node $out/bin/${name} --add-flags "$out/main.cjs"
  '';

  pnpmDeps = pkgsUnstable.pnpm_9.fetchDeps {
    pname = name;

    fetcherVersion = "2";
    src = ./.;

    # See README.md
    hash = "sha256-srIfn2aso/LeD8XNO5D9FbRMkOuLRbcd9A8NQRCeyrY=";
  };

  meta.mainProgram = name;
}
