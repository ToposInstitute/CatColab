{
  description = "configurations for deploying catcolab";

  inputs = {
    # The version of cargo in 24.11 is too old so we need to use unstable until the next relase (25.05)
    nixpkgs.url = "nixpkgs/nixos-unstable";
    crate2nix = {
      url = "github:nix-community/crate2nix";
      inputs.nixpkgs.follows = "nixpkgs";
    };

    agenix.url = "github:ryantm/agenix";
    deploy-rs.url = "github:serokell/deploy-rs";
  };

  outputs =
    {
      self,
      nixpkgs,
      crate2nix,
      agenix,
      deploy-rs,
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

      # Generate devShells for each system
      devShellForSystem = system:
        let
          pkgs = import nixpkgs {
            inherit system;
            config.allowUnfree = true;
          };

          # macOS-specific configurations for libraries
          darwinDeps = if pkgs.stdenv.isDarwin then [
            pkgs.darwin.apple_sdk.frameworks.Security
            pkgs.darwin.apple_sdk.frameworks.SystemConfiguration
            pkgs.libiconv
          ] else [];

        in pkgs.mkShell {
            name = "catcolab-devshell";
            buildInputs = with pkgs; [
              rustc
              cargo
              openssl
              rust-analyzer
              rustfmt
              clippy
              pkg-config
              pnpm_9
              nodejs_23
              sqlx-cli
              biome
            ] ++ darwinDeps ++ [
              inputs.agenix.packages.${system}.agenix
              inputs.deploy-rs.packages.${system}.default
              inputs.crate2nix.packages.${system}.default
            ];

            # macOS-specific environment variables for OpenSSL and pkg-config
            shellHook = ''
              ${if pkgs.stdenv.isDarwin then ''
                export OPENSSL_DIR=${pkgs.openssl.dev}
                export OPENSSL_LIB_DIR=${pkgs.openssl.out}/lib
                export OPENSSL_INCLUDE_DIR=${pkgs.openssl.dev}/include
                export PKG_CONFIG_PATH=${pkgs.openssl.dev}/lib/pkgconfig:$PKG_CONFIG_PATH
              '' else ""}
              # Load DATABASE_URL into the environment
              if [ -f packages/backend/.env ]; then
                export $(grep -v '^#' packages/backend/.env | xargs)
              fi
            '';
          };

    in {
      # Create devShells for all supported systems
      devShells = builtins.listToAttrs (map (system: {
        name = system;
        value = { default = devShellForSystem system; };
      }) devShellSystems);

      # Create a NixOS configuration for each host
      nixosConfigurations = {
        catcolab = nixpkgs.lib.nixosSystem {
          specialArgs = { inherit inputs; };
          system = linuxSystem;
          modules = [
            ./infrastructure/hosts/catcolab
            agenix.nixosModules.age
          ];
        };
        catcolab-next = nixpkgs.lib.nixosSystem {
          specialArgs = { inherit inputs; };
          system = linuxSystem;
          modules = [
            ./infrastructure/hosts/catcolab-next
            agenix.nixosModules.age
          ];
        };
        catcolab-jmoggr = nixpkgs.lib.nixosSystem {
          specialArgs = { inherit inputs; };
          system = linuxSystem;
          modules = [
            ./infrastructure/hosts/catcolab-jmoggr
            agenix.nixosModules.age
          ];
        };
      };

      deploy.nodes = {
        catcolab = {
          hostname = "backend.catcolab.org";
          profiles.system = {
            sshUser = "root";
            path = deploy-rs.lib.${linuxSystem}.activate.nixos self.nixosConfigurations.catcolab;
          };
        };
        catcolab-next = {
          hostname = "backend-next.catcolab.org";
          profiles.system = {
            sshUser = "root";
            path = deploy-rs.lib.${linuxSystem}.activate.nixos self.nixosConfigurations.catcolab-next;
          };
        };
        catcolab-jmoggr = {
          hostname = "backend-next.jmoggr.com";
          profiles.system = {
            sshUser = "root";
            path = deploy-rs.lib.${linuxSystem}.activate.nixos self.nixosConfigurations.catcolab-jmoggr;
          };
        };
      };
    };
}