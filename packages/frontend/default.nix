{
  pkgs,
  inputs,
  self,
  lib,
  ...
}:
let
  packageJson = builtins.fromJSON (builtins.readFile ./package.json);
  name = packageJson.name;
  version = packageJson.version;

  pkgsUnstable = import inputs.nixpkgsUnstable {
    system = "x86_64-linux";
  };

  commonAttrs = {
    version = version;
    # Filter source to only include packages needed for frontend build
    # This prevents unnecessary rebuilds when unrelated files change
    src = lib.fileset.toSource {
      root = ../../.;
      fileset = lib.fileset.unions [
        ../../.npmrc
        ../../pnpm-workspace.yaml
        ../../pnpm-lock.yaml
        ../../packages/frontend
        ../../packages/ui-components
        ../../packages/notebook-types
        ../../packages/backend/pkg
      ];
    };

    nativeBuildInputs = with pkgs; [
      pnpm_9.configHook
    ];

    buildInputs = with pkgs; [
      nodejs_24
    ];

    pnpmDeps = pkgsUnstable.pnpm_9.fetchDeps {
      pname = name;
      fetcherVersion = 2;
      # Only includes package.json and pnpm-lock.yaml files to ensure consistent hashing in different
      # environments
      src = lib.fileset.toSource {
        root = ../../.;
        fileset = lib.fileset.unions [
          ../../.npmrc
          ../../pnpm-workspace.yaml
          ../../pnpm-lock.yaml
          ../../packages/frontend/package.json
          ../../packages/frontend/pnpm-lock.yaml
          ../../packages/ui-components/package.json
          ../../packages/ui-components/pnpm-lock.yaml
          ../../packages/notebook-types/package.json
          ../../packages/notebook-types/pnpm-lock.yaml
          ../../packages/backend/pkg/package.json
          ../../packages/backend/pkg/pnpm-lock.yaml
        ];
      };
      # See README.md
      # hash = "";
      hash = "sha256-FqjdtE/OgmV+aYGh1AijQqvfg9/UQC/dClJRTLyGxCE=";
    };
  };

  package = pkgs.stdenv.mkDerivation (
    commonAttrs
    // {
      pname = name;

      buildPhase = ''
        # Set up catlog-wasm before TypeScript build needs it
        mkdir -p packages/catlog-wasm/dist/pkg-browser
        cp -r ${self.packages.x86_64-linux.catlog-wasm-browser}/* packages/catlog-wasm/dist/pkg-browser/

        cd packages/frontend
        # Build with development mode to use .env.development configuration
        npm run build:nix -- --mode development
        cd -
      '';

      installPhase = ''
        mkdir -p $out
        cp -r packages/frontend/dist/* $out
      '';
    }
  );

  tests = pkgs.stdenv.mkDerivation (
    commonAttrs
    // {
      pname = "${name}-tests";

      nativeBuildInputs = commonAttrs.nativeBuildInputs ++ [ pkgs.makeWrapper ];

      # Disable parts of the fixup phase. This is to improve performance, otherwise it would process
      # all of node_modules for no benefit.
      dontPatchELF = true;
      dontStrip = true;
      dontPatchShebangs = true;

      installPhase = ''
        # for vitest to work we need to basically recreate the development environment. We acheive this
        # by setting of up a copy of the packages structure.
        mkdir -p $out/packages

        mkdir -p $out/packages/catlog-wasm/dist/pkg-browser
        cp -r ${self.packages.x86_64-linux.catlog-wasm-browser}/* $out/packages/catlog-wasm/dist/pkg-browser/

        cp -r packages/backend $out/packages/
        cp -r packages/frontend $out/packages/
        cp -r packages/ui-components $out/packages/
        cp -r packages/notebook-types $out/packages/

        mkdir -p $out/bin
        # Wrapper script to load environment variables and wait for backend to become available
        cat > $out/bin/.${name}-tests-unwrapped <<'EOF'
        #!/usr/bin/env bash
        set -euo pipefail

        cd "@OUT@/packages/frontend"

        if [ ! -f .env.development ]; then
          echo "Error: .env.development file not found in $out/packages/frontend" >&2
          exit 1
        fi

        # Export all environment variables from .env.development
        set -a
        source .env.development
        set +a

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

        npm run test:ci
        EOF

        substituteInPlace $out/bin/.${name}-tests-unwrapped \
          --replace '@OUT@' "$out"

        chmod +x $out/bin/.${name}-tests-unwrapped

        # Wrap the script to ensure nodejs is in PATH
        makeWrapper $out/bin/.${name}-tests-unwrapped $out/bin/${name}-tests \
          --prefix PATH : ${pkgs.lib.makeBinPath [ pkgs.nodejs_24 ]}
      '';

      meta.mainProgram = "${name}-tests";
    }
  );
in
{
  inherit package tests;
}
