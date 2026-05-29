{
  pkgs,
  self,
  lib,
  pnpm2nix,
  ...
}:
let
  packageJson = builtins.fromJSON (builtins.readFile ./package.json);
  name = packageJson.name;
  version = packageJson.version;

  # pnpm2nix-nzbr exposes a `processLockfile` function in lockfile.nix that, given a
  # pnpm-lock.yaml, produces:
  #   - dependencyTarballs: a list of FODs (fetchurl/fetchGit/...) for each
  #     dependency tarball referenced by the lockfile.
  #   - patchedLockfile: an in-memory copy of the lockfile with every
  #     `resolution.tarball` rewritten to point at the local nix store tarball.
  #
  # We use these to drive an offline `pnpm install --frozen-lockfile`, which
  # avoids having to maintain a monolithic `pnpmDeps.hash` by hand: every
  # individual tarball is hashed via the integrity field already present in
  # the lockfile.
  lockfileLib = pkgs.callPackage (pnpm2nix + "/lockfile.nix") { };

  processLock = lockfile: lockfileLib.processLockfile {
    registry = "https://registry.npmjs.org";
    noDevDependencies = false;
    inherit lockfile;
  };

  # The frontend package and every sibling workspace member it pulls in via
  # `link:` need their lockfiles processed: each lockfile is rewritten to
  # reference nix-store tarballs, and the union of all dependency tarballs
  # is fed to `pnpm store add` so the offline install can resolve everything.
  # Because `.npmrc` sets `shared-workspace-lockfile=false`, each workspace
  # member has its own pnpm-lock.yaml that must be processed independently.
  lockfilesToProcess = {
    "packages/frontend" = ../frontend/pnpm-lock.yaml;
    "packages/ui-components" = ../ui-components/pnpm-lock.yaml;
    "packages/document-methods" = ../document-methods/pnpm-lock.yaml;
    "packages/backend/pkg" = ../backend/pkg/pnpm-lock.yaml;
    "tools/vite-plugin-monorepo-dedupe" = ../../tools/vite-plugin-monorepo-dedupe/pnpm-lock.yaml;
  };

  processedLocks = lib.mapAttrs (_: processLock) lockfilesToProcess;

  yamlFormat = pkgs.formats.yaml { };

  patchedLockfiles = lib.mapAttrs (
    relPath: processed:
    yamlFormat.generate "pnpm-lock-${builtins.replaceStrings [ "/" ] [ "-" ] relPath}.yaml"
      processed.patchedLockfile
  ) processedLocks;

  allTarballs = lib.unique (
    lib.concatLists (lib.mapAttrsToList (_: p: p.dependencyTarballs) processedLocks)
  );

  # File containing the space-separated list of all dependency tarball paths,
  # consumed by `pnpm store add` to seed the offline store.
  dependencyTarballsFile = pkgs.runCommand "${name}-dependency-tarballs" { } ''
    echo ${lib.concatStringsSep " " allTarballs} > $out
  '';

  commonAttrs = {
    inherit version;
    # Filter source to only include packages needed for frontend build
    # This prevents unnecessary rebuilds when unrelated files change
    src = lib.fileset.toSource {
      root = ../../.;
      fileset = lib.fileset.unions [
        ../../.npmrc
        ../../pnpm-workspace.yaml
        ../../pnpm-lock.yaml
        (lib.fileset.maybeMissing ../../patches)
        ../../packages/frontend
        ../../packages/ui-components
        ../../tools/vite-plugin-monorepo-dedupe
        ../../packages/document-methods
        ../../packages/backend/pkg
      ];
    };

    nativeBuildInputs = with pkgs; [
      nodejs_24
      pnpm
    ];

    buildInputs = with pkgs; [
      nodejs_24
    ];

    # Drive pnpm install ourselves, using the lockfile-derived nix store
    # tarballs from pnpm2nix-nzbr instead of pnpm.configHook + fetchPnpmDeps.
    # This phase runs from the unpacked source root (monorepo subset).
    configurePhase = ''
      runHook preConfigure

      export HOME=$NIX_BUILD_TOP
      export npm_config_nodedir=${pkgs.nodejs_24}

      # Replace each workspace member's lockfile with the version whose tarball
      # references point at /nix/store paths so pnpm doesn't hit the network.
      ${lib.concatStringsSep "\n" (
        lib.mapAttrsToList (relPath: patched: ''
          cp -fv ${patched} ${relPath}/pnpm-lock.yaml
        '') patchedLockfiles
      )}

      # Pre-populate the local pnpm content-addressable store with every
      # tarball referenced by the patched lockfiles.
      store=$(pnpm store path)
      mkdir -p "$(dirname "$store")"
      pnpm store add $(cat ${dependencyTarballsFile})

      # Install dependencies for every workspace member. Recursive install
      # handles the `link:` deps between members correctly.
      pnpm install \
        --recursive \
        --ignore-scripts \
        --force \
        --frozen-lockfile \
        --prefer-offline

      runHook postConfigure
    '';
  };

  package = pkgs.stdenv.mkDerivation (
    commonAttrs
    // {
      pname = name;

      buildPhase = ''
        runHook preBuild

        # Set up catlog-wasm before TypeScript build needs it
        mkdir -p packages/catlog-wasm/dist/pkg-browser
        cp -r ${self.packages.${pkgs.stdenv.hostPlatform.system}.catlog-wasm-browser}/* packages/catlog-wasm/dist/pkg-browser/

        # Set up document-types wasm output
        mkdir -p packages/document-types/pkg
        cp -r ${self.packages.${pkgs.stdenv.hostPlatform.system}.document-types-wasm}/* packages/document-types/pkg/

        # Set up generated API bindings
        mkdir -p packages/backend/pkg/src
        cp -r ${self.packages.${pkgs.stdenv.hostPlatform.system}.catcolabApi}/src packages/backend/pkg/

        cd packages/frontend
        # Generate CSS module type declarations
        pnpm run build:tcm
        # Build with development mode to use .env.development configuration
        pnpm run build -- --mode development
        cd -

        runHook postBuild
      '';

      installPhase = ''
        runHook preInstall

        mkdir -p $out
        cp -r packages/frontend/dist/* $out

        runHook postInstall
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

      # No build step; we just package up the tree with node_modules.
      dontBuild = true;

      installPhase = ''
        runHook preInstall

        # for vitest to work we need to basically recreate the development environment. We achieve this
        # by setting of up a copy of the packages structure.
        mkdir -p $out/packages

        mkdir -p $out/packages/catlog-wasm/dist/pkg-browser
        cp -r ${self.packages.${pkgs.stdenv.hostPlatform.system}.catlog-wasm-browser}/* $out/packages/catlog-wasm/dist/pkg-browser/

        # Set up document-types wasm output before copying to $out
        mkdir -p packages/document-types/pkg
        cp -r ${self.packages.${pkgs.stdenv.hostPlatform.system}.document-types-wasm}/* packages/document-types/pkg/

        # Bindings must be copied into source tree BEFORE the cp below copies backend to $out
        mkdir -p packages/backend/pkg/src
        cp -r ${self.packages.${pkgs.stdenv.hostPlatform.system}.catcolabApi}/src packages/backend/pkg/

        cp -r packages/backend $out/packages/
        cp -r packages/frontend $out/packages/
        cp -r packages/ui-components $out/packages/
        mkdir -p $out/tools
        cp -r tools/vite-plugin-monorepo-dedupe $out/tools/
        cp -r packages/document-methods $out/packages/
        mkdir -p $out/packages/document-types
        cp -r packages/document-types/pkg $out/packages/document-types/

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

        runHook postInstall
      '';

      meta.mainProgram = "${name}-tests";
    }
  );
in
{
  inherit package tests;
}
