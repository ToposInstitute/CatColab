{
  pkgs,
  ...
}:
let
  packageJson = builtins.fromJSON (builtins.readFile ./package.json);
  name = packageJson.name;
  version = packageJson.version;
in
pkgs.stdenv.mkDerivation {
  pname = name;
  version = version;
  src = ./.;

  nativeBuildInputs = with pkgs; [
    pnpm_9.configHook
    esbuild
  ];

  buildInputs = with pkgs; [
    nodejs_23
  ];

  installPhase = ''
    mkdir -p $out/

    # We use esbuild instead of tsc for building, as it bundles all required JavaScript into a single
    # file. This avoids copying the entire ~200MB node_modules directory to the remote machine during
    # deploy-rs deployments, which can increase the deployment time by >2x. It's an intentional
    # trade-off: slightly increased configuration complexity in exchange for faster development
    # iterations.
    ${pkgs.lib.getExe pkgs.esbuild} src/main.ts --bundle --platform=node --format=cjs --outfile=$out/main.cjs

    # Since we are no longer copying the entire node_modules directory, we need to manually find and copy
    # the wasm file for automerge
    automerge_wasm_path=$(find node_modules/.pnpm -path "*/wasm_bindgen_output/nodejs/automerge_wasm_bg.wasm" 2>/dev/null | head -n 1)
    if [ -z "$automerge_wasm_path" ]; then
      echo "❌ Error: Node.js automerge WASM file not found!"
      exit 1
    fi
    cp "$automerge_wasm_path" "$out/"
  '';

  pnpmDeps = pkgs.pnpm_9.fetchDeps {
    pname = name;
    version = version;
    src = ./.;

    # See README.md
    # hash = pkgs.lib.fakeHash;
    hash = "sha256-ADAtb70sy2ORnbyl+DHeVByEigc5e0VXzT4lkhfOdX8=";
  };

  meta.mainProgram = name;
}
