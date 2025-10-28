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

  # Common attributes shared between package and tests nix packages
  commonAttrs = {
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
      hash = "sha256-YxOmlC7m2mGaTWeaJHdqq6gWAOirZrU/uvNLI1Q1XGk=";
    };
  };

  # Script snippet to set up the catcolab-api package from backend during the installPhase.
  # The catcolab-api package is a bit odd since it's a built/generated dependency that's tracked by
  # git. Fortunately it shares dependencies with the frontend, so we can just copy them.
  copyBackendNodeModules =
    # bash
    ''
      mkdir -p ../backend/pkg/node_modules
      cp -Lr node_modules/@qubit-rs ../backend/pkg/node_modules/
      cp -Lr node_modules/typescript ../backend/pkg/node_modules/
    '';

  package = pkgs.stdenv.mkDerivation (
    commonAttrs
    // {
      pname = name;

      installPhase = ''
        ${copyBackendNodeModules}

        npm run build:nix

        mkdir -p $out
        cp -r ./dist/* $out
      '';

      # meta.mainProgram = name;
    }
  );

  tests = pkgs.stdenv.mkDerivation (
    commonAttrs
    // {
      pname = "${name}-tests";

      # Disable parts of the fixup phase. This is to improve performance, otherwise it would process
      # all of node_modules for no benefit.
      dontPatchELF = true;
      dontStrip = true;

      installPhase = ''
        ${copyBackendNodeModules}

        mkdir -p $out/bin
        cd ..
        cp -r catlog-wasm $out/
        cp -r backend $out/
        cp -r frontend $out/

        cat > $out/bin/frontend-tests <<'EOF'
        #!/usr/bin/env bash
        set -euo pipefail

        cd "@OUT@/frontend"

        if [ ! -f .env.development ]; then
          echo "Error: .env.development file not found in $out/frontend" >&2
          exit 1
        fi

        # Export all environment variables from .env.development
        set -a
        source .env.development
        set +a

        echo $VITE_AUTOMERGE_REPO_URL
        echo $VITE_SERVER_URL
        # Wait for server to be available
        echo "Waiting for backend at $VITE_SERVER_URL/status to be available..."
        timeout=30
        elapsed=0

        while [ $elapsed -lt $timeout ]; do
          if response=$(curl -s "$VITE_SERVER_URL/status" 2>/dev/null); then
            if [ "$response" = "Running" ]; then
              echo "Server is running!"
              break
            fi
          fi

          if [ $elapsed -ge $timeout ]; then
            echo "Error: Timeout waiting for server to be available after ''${timeout}s" >&2
            exit 1
          fi

          sleep 1
          elapsed=$((elapsed + 1))
        done

        echo "Waiting 5 seconds for services to stabilize..."
        sleep 3

        npm run test:ci
        EOF

        substituteInPlace $out/bin/${name}-tests \
          --replace '@OUT@' "$out"

        chmod +x $out/bin/${name}-tests
      '';

      meta.mainProgram = "${name}-tests";
    }
  );
in
{
  inherit package tests;
}
