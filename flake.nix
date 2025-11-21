{
  description = "configurations for deploying catcolab";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixos-25.05";
    agenix.url = "github:ryantm/agenix";
    deploy-rs.url = "github:serokell/deploy-rs";
    fenix = {
      url = "github:nix-community/fenix";
      inputs.nixpkgs.follows = "nixpkgs";
    };

    crane = {
      url = "github:ipetkov/crane";
    };

    nixpkgsUnstable = {
      # TODO: this should be changed from 'master' to 'nixos-unstable' when the
      # pnpm.fetchDeps.fetcherVersion option lands in nixos-unstable (it's not clear how long that will
      # be)
      url = "github:NixOS/nixpkgs/master";
    };

    nixos-generators.url = "github:nix-community/nixos-generators";
  };

  outputs =
    {
      self,
      nixpkgs,
      deploy-rs,
      fenix,
      crane,
      nixos-generators,
      ...
    }@inputs:
    let
      # Linux-specific outputs (NixOS configurations and deploy)
      linuxSystem = "x86_64-linux";

      devShellSystems = [
        "x86_64-linux"
        "x86_64-darwin"
        "aarch64-darwin"
      ];

      nixpkgsFor =
        system:
        import nixpkgs {
          inherit system;
          config.allowUnfree = true;
        };

      rustToolchainFor =
        system:
        inputs.fenix.packages.${system}.fromToolchainFile {
          file = ./rust-toolchain.toml;
          sha256 = "sha256-2eWc3xVTKqg5wKSHGwt1XoM/kUBC6y3MWfKg74Zn+fY=";
        };

      pkgsLinux = nixpkgsFor linuxSystem;
      rustToolchainLinux = rustToolchainFor linuxSystem;

      craneLib = (crane.mkLib pkgsLinux).overrideToolchain rustToolchainLinux;

      cargoArtifacts = craneLib.buildDepsOnly {
        src = craneLib.cleanCargoSource ./.;
        strictDeps = true;
        nativeBuildInputs = [
          pkgsLinux.pkg-config
        ];

        buildInputs = [
          pkgsLinux.openssl
        ];
      };

      # Generate devShells for each system
      devShellForSystem =
        system:
        let
          pkgs = nixpkgsFor system;
          rustToolchain = rustToolchainFor system;

          # macOS-specific configurations for libraries
          darwinDeps =
            if pkgs.stdenv.isDarwin then
              [
                pkgs.darwin.apple_sdk.frameworks.Security
                pkgs.darwin.apple_sdk.frameworks.SystemConfiguration
                pkgs.libiconv
              ]
            else
              [ ];

          pkgsUnstable = import inputs.nixpkgsUnstable {
            system = "x86_64-linux";
          };
        in
        pkgs.mkShell {
          name = "catcolab-devshell";
          buildInputs =
            with pkgs;
            [
              darkhttpd
              lld
              rustToolchain
              openssl
              rust-analyzer
              rustfmt
              clippy
              pkg-config
              pnpm_9
              nodejs_24
              sqlx-cli
              wasm-pack
              vscode-langservers-extracted
              wasm-bindgen-cli
              esbuild
              python312Packages.jupyter-server
              python312Packages.jupyter-core
              python312Packages.websocket-client
              python312Packages.requests
              python312Packages.ipykernel
              python3
            ]
            ++ darwinDeps
            ++ [
              inputs.agenix.packages.${system}.agenix
              inputs.deploy-rs.packages.${system}.default
              pkgsUnstable.biome
            ];

          # macOS-specific environment variables for OpenSSL and pkg-config
          shellHook = ''
            ${
              if pkgs.stdenv.isDarwin then
                ''
                  export OPENSSL_DIR=${pkgs.openssl.dev}
                  export OPENSSL_LIB_DIR=${pkgs.openssl.out}/lib
                  export OPENSSL_INCLUDE_DIR=${pkgs.openssl.dev}/include
                  export PKG_CONFIG_PATH=${pkgs.openssl.dev}/lib/pkgconfig:$PKG_CONFIG_PATH
                ''
              else
                ""
            }

            export PATH=$PWD/infrastructure/scripts:$PATH

            # Load DATABASE_URL into the environment
            if [ -f packages/backend/.env ]; then
              export $(grep -v '^#' packages/backend/.env | xargs)
            fi
          '';
        };

      # NOTE: this is not currently used, but was painful to build and might be useful in the future.
      # Wraps the typical `deploy-rs.lib.${linuxSystem}.activate.nixos` activation function
      # with a custom script that can run additional health checks. The script runs on the remote host
      # and if it fails the whole deployment will fail.
      # use:
      # `deploy.nodes.${host}.profiles.system.path = healthcheckWrapper self.nixosConfigurations.host;`
      healthcheckWrapper =
        nixosConfiguration:
        let
          defaultNixos = deploy-rs.lib.${linuxSystem}.activate.nixos nixosConfiguration;

          healthcheckWrapperScript = pkgsLinux.writeShellScriptBin "healthcheck-wrapper-script" ''
            PROFILE=${defaultNixos}
            # insert healthchecks
            ${defaultNixos}/deploy-rs-activate
          '';
        in
        deploy-rs.lib.${linuxSystem}.activate.custom healthcheckWrapperScript
          "./bin/healthcheck-wrapper-script";
    in
    {
      # Create devShells for all supported systems
      devShells = builtins.listToAttrs (
        map (system: {
          name = system;
          value = {
            default = devShellForSystem system;
          };
        }) devShellSystems
      );

      packages = {
        x86_64-linux = {
          catcolabApi = pkgsLinux.stdenv.mkDerivation {
            pname = "catcolab-api";
            version = "0.1.0";

            src = ./packages/backend/pkg;

            installPhase = ''
              mkdir -p $out
              cp -r * $out/
            '';
          };

          backend = pkgsLinux.callPackage ./packages/backend/default.nix {
            inherit craneLib cargoArtifacts self;
            pkgs = pkgsLinux;
          };

          migrator = pkgsLinux.callPackage ./packages/migrator/default.nix {
            inherit craneLib cargoArtifacts;
            pkgs = pkgsLinux;
          };

          notebook-types-node = pkgsLinux.callPackage ./packages/notebook-types/default.nix {
            inherit craneLib cargoArtifacts;
            pkgs = pkgsLinux;
          };

          catlog-wasm-browser = pkgsLinux.callPackage ./packages/catlog-wasm/default.nix {
            inherit craneLib cargoArtifacts;
            pkgs = pkgsLinux;
          };

          automerge = pkgsLinux.callPackage ./packages/automerge-doc-server/default.nix {
            inherit inputs rustToolchainLinux self;
          };

          frontend =
            (pkgsLinux.callPackage ./packages/frontend/default.nix {
              inherit inputs rustToolchainLinux self;
            }).package;

          frontend-tests =
            (pkgsLinux.callPackage ./packages/frontend/default.nix {
              inherit inputs rustToolchainLinux self;
            }).tests;

          # VMs built with `nixos-rebuild build-vm` (like `nix build
          # .#nixosConfigurations.catcolab-vm.config.system.build.vm`) are not the same
          # as "traditional" VMs, which causes deploy-rs to fail when deploying to them.
          # https://github.com/serokell/deploy-rs/issues/85#issuecomment-885782350
          #
          # This is worked around by creating a full featured QEMU VM image.
          catcolab-vm = pkgsLinux.stdenv.mkDerivation {
            name = "catcolab-vm";
            src = nixos-generators.nixosGenerate {
              system = "x86_64-linux";
              format = "qcow";

              modules = [
                ./infrastructure/hosts/catcolab-vm
              ];

              specialArgs = {
                inherit inputs self;
                rustToolchain = rustToolchainLinux;
              };
            };
            installPhase = ''
              mkdir -p $out
              cp $src/nixos.qcow2 $out/catcolab-vm.qcow2
            '';
          };
        };
      };

      # Create a NixOS configuration for each host
      nixosConfigurations = {
        catcolab = nixpkgs.lib.nixosSystem {
          specialArgs = {
            inherit inputs self;
            rustToolchain = rustToolchainLinux;
          };
          system = linuxSystem;
          modules = [
            ./infrastructure/hosts/catcolab
          ];
          pkgs = pkgsLinux;
        };
        catcolab-next = nixpkgs.lib.nixosSystem {
          specialArgs = {
            inherit inputs self;
            rustToolchain = rustToolchainLinux;
          };
          system = linuxSystem;
          modules = [
            ./infrastructure/hosts/catcolab-next
          ];
          pkgs = pkgsLinux;
        };

        catcolab-vm = nixpkgs.lib.nixosSystem {
          system = linuxSystem;
          modules = [
            ./infrastructure/hosts/catcolab-vm
          ];
          specialArgs = {
            inherit inputs self;
            rustToolchain = rustToolchainLinux;
          };
        };
      };

      deploy.nodes = {
        catcolab = {
          hostname = "backend.catcolab.org";
          profiles.system = {
            # TODO: can be changed to catcolab after the next deploy (the host needs to first update the
            # permissions of the catcolab user)
            sshUser = "root";
            path = deploy-rs.lib.${linuxSystem}.activate.nixos self.nixosConfigurations.catcolab;
          };
        };
        catcolab-next = {
          hostname = "backend-next.catcolab.org";
          profiles.system = {
            sshUser = "catcolab";
            user = "root";
            path = deploy-rs.lib.${linuxSystem}.activate.nixos self.nixosConfigurations.catcolab-next;
          };
        };
        catcolab-vm = {
          hostname = "localhost";
          fastConnection = true;
          profiles.system = {
            sshOpts = [
              "-p"
              "2221"
            ];
            sshUser = "catcolab";
            path = deploy-rs.lib.${linuxSystem}.activate.nixos self.nixosConfigurations.catcolab-vm;
            user = "root";
          };
        };
      };

      checks.x86_64-linux.frontendTests = import ./infrastructure/tests/frontend.nix {
        inherit
          nixpkgs
          inputs
          self
          linuxSystem
          ;
        rustToolchain = rustToolchainLinux;
      };
    };
}
