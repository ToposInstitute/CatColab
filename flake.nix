{
  description = "configurations for deploying catcolab";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixos-24.11";
    crate2nix = {
      url = "github:nix-community/crate2nix";
      inputs.nixpkgs.follows = "nixpkgs";
    };
    agenix.url = "github:ryantm/agenix";
    deploy-rs.url = "github:serokell/deploy-rs";
    fenix = {
      url = "github:nix-community/fenix";
      inputs.nixpkgs.follows = "nixpkgs";
    };

    nixpkgsUnstable = {
      # TODO: update this to nixos-unstable the next time someone looks at this (required changes haven't
      # landed yet, but should really soon)
      url = "github:NixOS/nixpkgs/master";
    };
  };

  outputs =
    {
      self,
      nixpkgs,
      deploy-rs,
      fenix,
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

      rustToolchain = fenix.packages.x86_64-linux.fromToolchainFile {
        file = ./rust-toolchain.toml;
        sha256 = "sha256-Qxt8XAuaUR2OMdKbN4u8dBJOhSHxS+uS06Wl9+flVEk=";
      };

      nixpkgsFor =
        system:
        import nixpkgs {
          inherit system;
          config.allowUnfree = true;
        };

      pkgsLinux = nixpkgsFor linuxSystem;

      # Generate devShells for each system
      devShellForSystem =
        system:
        let
          pkgs = nixpkgsFor system;

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

        in
        pkgs.mkShell {
          name = "catcolab-devshell";
          buildInputs =
            with pkgs;
            [
              lld
              rustToolchain
              openssl
              rust-analyzer
              rustfmt
              clippy
              pkg-config
              pnpm_9
              nodejs_23
              sqlx-cli
              biome
              lld
            ]
            ++ darwinDeps
            ++ [
              inputs.agenix.packages.${system}.agenix
              inputs.deploy-rs.packages.${system}.default
              inputs.crate2nix.packages.${system}.default
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

      # Create a NixOS configuration for each host
      nixosConfigurations = {
        catcolab = nixpkgs.lib.nixosSystem {
          specialArgs = {
            inherit inputs rustToolchain;
          };
          system = linuxSystem;
          modules = [
            ./infrastructure/hosts/catcolab
          ];
          pkgs = pkgsLinux;
        };
        catcolab-next = nixpkgs.lib.nixosSystem {
          specialArgs = { inherit inputs rustToolchain; };
          system = linuxSystem;
          modules = [
            ./infrastructure/hosts/catcolab-next
          ];
          pkgs = pkgsLinux;
        };

        catcolab-vm = nixpkgs.lib.nixosSystem {
          system = linuxSystem;
          modules = [ ./infrastructure/hosts/catcolab-vm ];
          specialArgs = { inherit inputs rustToolchain; };
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
      };

      # The backend relies on Firebase, so tests require VM internet access. Enable networking by running
      # with --no-sandbox.
      # Docs for nixos tests: https://nixos.org/manual/nixos/stable/index.html#sec-nixos-test-nodes
      # (google and LLMs are useless)
      checks.x86_64-linux.integrationTests = nixpkgs.legacyPackages.x86_64-linux.testers.runNixOSTest {
        name = "Integration Tests";

        skipTypeCheck = true;
        nodes = {
          catcolab = import ./infrastructure/hosts/catcolab-vm;
        };

        node.specialArgs = {
          inherit rustToolchain inputs;
        };

        testScript = ''
          def dump_logs(machine, *units):
              for u in units:
                  print(f"\n===== journal for {u} =====")
                  print(machine.succeed(f"journalctl -u {u} --no-pager"))

          def test_service(machine, service):
              try:
                  machine.wait_for_unit(service)
              except:
                  dump_logs(machine, service)
                  raise

          def test_oneshot_service(machine, service):
              try:
                  machine.wait_until_succeeds(
                      f"test $(systemctl is-active {service}) = inactive"
                  )
              except:
                  dump_logs(machine, service)
                  raise

          test_oneshot_service(catcolab, "database-setup.service")
          test_oneshot_service(catcolab, "migrations.service")

          test_service(catcolab, "automerge.service");
          test_service(catcolab, "backend.service");
          test_service(catcolab, "caddy.service");

          catcolab.start_job("backupdb.service")
          test_oneshot_service(catcolab, "backupdb.service")
        '';
      };
    };
}
