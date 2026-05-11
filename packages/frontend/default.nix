{
  pkgs,
  self,
  lib,
  ...
}:
let
  packageJson = builtins.fromJSON (builtins.readFile ./package.json);
  name = packageJson.name;
  version = packageJson.version;

  rushLockfile = ../../common/config/rush/pnpm-lock.yaml;
  rushNpmrc = ../../common/config/rush/.npmrc;

  # The Rush-managed lockfile lives at common/config/rush/pnpm-lock.yaml,
  # not at the repo root. fetchPnpmDeps and pnpmConfigHook both expect to find
  # a pnpm-lock.yaml at the source root, so we build a synthetic "fetch-src"
  # tree that places the Rush lockfile at root along with a generated
  # pnpm-workspace.yaml and root package.json equivalent to what Rush stages
  # in common/temp/.
  #
  # The workspace lists each project relative to the synthetic root, which
  # itself contains symlinks to the real project directories.

  # We rewrite the Rush lockfile to have project paths relative to the
  # fetch-src root (rather than common/temp/) so fetchPnpmDeps can consume it.
  pnpmWorkspaceYaml = pkgs.writeText "pnpm-workspace.yaml" ''
    packages:
      - dev-docs
      - packages/backend/pkg
      - packages/catlog-wasm
      - packages/document-methods
      - packages/document-types
      - packages/frontend
      - packages/gaios
      - packages/ui-components
  '';

  rootPackageJson = pkgs.writeText "package.json" (builtins.toJSON {
    name = "rush-common";
    private = true;
    version = "0.0.0";
    pnpm = {
      onlyBuiltDependencies = [ "esbuild" "playwright" ];
      minimumReleaseAge = 12960;
    };
  });

  # Source filtered down to just what fetchPnpmDeps needs (package.json files
  # plus the lockfile + npmrc). The actual file layout is rebuilt below.
  #
  # We use --ignore-pnpmfile via pnpmInstallFlags so the host-specific
  # `.pnpmfile.cjs` Rush generates (which references absolute paths into
  # ~/.rush/install-run/...) does not need to exist or run inside Nix.
  # We also strip the `pnpmfileChecksum:` line so pnpm doesn't complain about
  # the missing pnpmfile.
  fetchSrc = pkgs.runCommand "${name}-fetch-src" { } ''
    mkdir -p $out/dev-docs
    mkdir -p $out/packages/{backend/pkg,catlog-wasm,document-methods,document-types,frontend,gaios,ui-components}
    # Rewrite the Rush lockfile so:
    #  * the Rush-injected pnpmfileChecksum field is dropped, and
    #  * importer paths (which Rush stages relative to common/temp/) become
    #    relative to the synthetic root, matching pnpm-workspace.yaml.
    sed -E \
      -e '/^[[:space:]]*pnpmfileChecksum:/d' \
      -e 's|\.\./\.\./packages/|packages/|g' \
      -e 's|\.\./\.\./dev-docs|dev-docs|g' \
      ${rushLockfile} > $out/pnpm-lock.yaml
    cp ${rushNpmrc}                                            $out/.npmrc
    cp ${pnpmWorkspaceYaml}                                    $out/pnpm-workspace.yaml
    cp ${rootPackageJson}                                      $out/package.json
    cp ${../../dev-docs/package.json}                          $out/dev-docs/package.json
    cp ${../../packages/frontend/package.json}                 $out/packages/frontend/package.json
    cp ${../../packages/gaios/package.json}                    $out/packages/gaios/package.json
    cp ${../../packages/ui-components/package.json}            $out/packages/ui-components/package.json
    cp ${../../packages/document-methods/package.json}         $out/packages/document-methods/package.json
    cp ${../../packages/backend/pkg/package.json}              $out/packages/backend/pkg/package.json
    cp ${../../packages/catlog-wasm/package.json}              $out/packages/catlog-wasm/package.json
    cp ${../../packages/document-types/package.json}           $out/packages/document-types/package.json
  '';

  # Full source for the actual build - includes everything from fetchSrc plus
  # the project source files.
  buildSrc = pkgs.runCommand "${name}-build-src" { } ''
    cp -r ${fetchSrc} $out
    chmod -R +w $out

    cp -r ${../../packages/frontend}/.        $out/packages/frontend/
    cp -r ${../../packages/ui-components}/.   $out/packages/ui-components/
    cp -r ${../../packages/document-methods}/. $out/packages/document-methods/
    cp -r ${../../packages/backend/pkg}/.     $out/packages/backend/pkg/
    # catlog-wasm, document-types, gaios, dev-docs only need their package.json.
    # Their build artifacts (for the wasm pkgs) are injected later from the
    # catlog-wasm-browser and document-types-wasm derivations.
  '';

  commonAttrs = {
    inherit version;
    src = buildSrc;

    nativeBuildInputs = with pkgs; [
      pnpm.configHook
    ];

    buildInputs = with pkgs; [
      nodejs_24
    ];

    pnpmDeps = pkgs.fetchPnpmDeps {
      # see ../../dev-docs/fixing-hash-mismatches.md
      hash = "sha256-2rI3txg9qPoeUxzzwpQ3hZao/lJjzaw8fWYLxDIUWD4=";

      pname = name;
      fetcherVersion = 2;
      pnpmInstallFlags = [ "--ignore-pnpmfile" ];
      src = fetchSrc;
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

        # Set up document-types wasm output
        mkdir -p packages/document-types/pkg
        cp -r ${self.packages.x86_64-linux.document-types-wasm}/* packages/document-types/pkg/

        # Set up generated API bindings
        mkdir -p packages/backend/pkg/src
        cp -r ${self.packages.x86_64-linux.catcolabApi}/src packages/backend/pkg/

        cd packages/frontend
        # Generate CSS module type declarations
        npm run build:tcm
        # Build with development mode to use .env.development configuration
        npm run build -- --mode development
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
        # for vitest to work we need to basically recreate the development environment.
        # The pnpm-managed node_modules/.pnpm store at the build root contains all
        # the actual deps that the per-project node_modules symlinks point to, so we
        # must copy that too.
        mkdir -p $out

        # Copy root-level files needed by pnpm workspaces and package resolution
        cp -r node_modules $out/
        cp pnpm-lock.yaml $out/
        cp pnpm-workspace.yaml $out/
        cp package.json $out/

        mkdir -p $out/packages

        mkdir -p $out/packages/catlog-wasm/dist/pkg-browser
        cp -r ${self.packages.x86_64-linux.catlog-wasm-browser}/* $out/packages/catlog-wasm/dist/pkg-browser/

        # Set up document-types wasm output before copying to $out
        mkdir -p packages/document-types/pkg
        cp -r ${self.packages.x86_64-linux.document-types-wasm}/* packages/document-types/pkg/

        # Bindings must be copied into source tree BEFORE the cp below copies backend to $out
        mkdir -p packages/backend/pkg/src
        cp -r ${self.packages.x86_64-linux.catcolabApi}/src packages/backend/pkg/

        cp -r packages/backend $out/packages/
        cp -r packages/frontend $out/packages/
        cp -r packages/ui-components $out/packages/
        cp -r packages/document-methods $out/packages/
        cp -r packages/gaios $out/packages/
        mkdir -p $out/packages/document-types
        cp -r packages/document-types/pkg $out/packages/document-types/
        # Also copy catlog-wasm's package.json so node module resolution works.
        cp packages/catlog-wasm/package.json $out/packages/catlog-wasm/
        # dev-docs is part of the pnpm workspace but only needs its package.json
        cp -r dev-docs $out/

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

          sleep 1
          elapsed=$((elapsed + 1))
        done

        if [ "$response" != "Running" ]; then
          echo "Error: Timeout waiting for server to be available after ''${timeout}s" >&2
          exit 1
        fi

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
