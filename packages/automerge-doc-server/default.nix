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

  patchPhase = ''
    mkdir -p ./pkg-node
    cp -r ${self.packages.catlog-wasm}/* ./pkg-node/
  '';

  installPhase = ''
    # We use esbuild instead of tsc for building, as it bundles all required JavaScript into a single
    # file. This avoids copying the entire ~200MB node_modules directory to the remote machine during deployments.
    # iterations.
    ${pkgs.lib.getExe pkgs.esbuild} src/main.ts --bundle --platform=node --format=cjs --loader:.wasm=file --outfile=$out/main.cjs

    # Since we are no longer copying the entire node_modules directory, we need to manually find and copy
    # the wasm file for automerge
    automerge_wasm_path=$(find node_modules/.pnpm -path "*/wasm_bindgen_output/nodejs/automerge_wasm_bg.wasm" 2>/dev/null | head -n 1)
    if [ -z "$automerge_wasm_path" ]; then
      echo "❌ Error: Node.js automerge WASM file not found!"
      exit 1
    fi

    # # echo "ESBUILD"
    # # ${pkgs.lib.getExe pkgs.esbuild} --version
    # # exit 1
    cp "${self.packages.catlog-wasm}/catlog_wasm_bg.wasm" "$out/"
    cp "$automerge_wasm_path" "$out/"

    # mkdir -p $out/bin
    # makeWrapper ${pkgs.nodejs_24}/bin/node $out/bin/${name} --add-flags "$out/main.cjs"
  '';

  pnpmDeps = pkgsUnstable.pnpm_9.fetchDeps {
    pname = name;

    fetcherVersion = "2";
    src = ./.;

    # See README.md
    # hash = "";
    hash = "sha256-LViebHXSetQdKCcuLTO2k+SdYeEoF57CMLnYKVEjcb4=";
  };

  meta.mainProgram = name;
}
