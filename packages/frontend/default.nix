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

  # Common configuration shared between build and tests
  commonConfig = {
    version = version;
    src = ./.;

    nativeBuildInputs = with pkgs; [
      pnpm_9.configHook
    ];

    buildInputs = with pkgs; [
      nodejs_24
    ];

    # package.json expects notebook-types to be at ../notebook-types, we COULD modify the parent of the nix
    # `build` directory, but this is technically unsupported. Instead we recreate part of the `packages`
    # directory structure in a way familiar to pnpm.
    unpackPhase = ''
      mkdir -p ./catlog-wasm/dist/pkg-browser
      cp -r ${self.packages.x86_64-linux.catlog-wasm-browser}/* ./catlog-wasm/dist/pkg-browser/

      mkdir -p ./backend/pkg
      cp -r ${self.packages.x86_64-linux.catcolabApi}/* ./backend/pkg/

      mkdir ./frontend
      cp -r $src/* ./frontend
      cp -r $src/.* ./frontend

      cd ./frontend
    '';

    pnpmDeps = pkgsUnstable.pnpm_9.fetchDeps {
      pname = name;

      fetcherVersion = "2";
      src = ./.;

      # See README.md
      # hash = "";
      hash = "sha256-9S+1IKKbeIn6qvdcpn8Mn0PC86UNFnxgdjS7vl3xatM=";
    };
  };

  # Setup script for catcolab-api dependencies (used by both build and tests)
  setupCatcolabApiDeps = ''
    # The catcolab-api package is a bit odd since it's a built/generated dependency that's tracked by
    # git. Fortunately it shares dependencies with the frontend, so we can just copy them.
    mkdir -p ../backend/pkg/node_modules
    cp -Lr node_modules/@qubit-rs ../backend/pkg/node_modules/
    cp -Lr node_modules/typescript ../backend/pkg/node_modules/
  '';
in
{
  # Main frontend package
  package = pkgs.stdenv.mkDerivation (
    commonConfig
    // {
      pname = name;

      installPhase = ''
        ${setupCatcolabApiDeps}

        npm run build:nix

        mkdir -p $out
        cp -r ./dist/* $out
      '';

      meta.mainProgram = name;
    }
  );

  # Vitest tests package - creates an executable that runs tests
  tests = pkgs.stdenv.mkDerivation (
    commonConfig
    // {
      pname = "${name}-tests";

      installPhase = ''
        ${setupCatcolabApiDeps}

        # Create the output directory structure
        mkdir -p $out/bin
        mkdir -p $out/lib

        # Copy the entire workspace structure (catlog-wasm, backend, frontend)
        # to maintain the relative symlinks in node_modules
        cd ..
        cp -r catlog-wasm $out/lib/
        cp -r backend $out/lib/
        cp -r frontend $out/lib/

        # Create executable wrapper script
        cat > $out/bin/frontend-tests <<'EOF'
        #!/usr/bin/env bash
        set -euo pipefail

        # Create temporary cache directory for Vite
        export XDG_CACHE_HOME=$(mktemp -d)
        trap "rm -rf $XDG_CACHE_HOME" EXIT

        # Navigate to the frontend directory (can run from read-only Nix store)
        cd "$out/lib/frontend"

        # Run vitest tests
        npm run test -- --run
        EOF

        # Make the script executable
        chmod +x $out/bin/frontend-tests

        # Substitute $out in the script
        substituteInPlace $out/bin/frontend-tests \
          --replace '$out' "$out"
      '';

      meta.description = "Vitest tests for the catcolab frontend";
    }
  );
}
