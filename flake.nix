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
      system = "x86_64-linux";

      pkgs = import nixpkgs {
        inherit system;
        config.allowUnfree = true;
      };
    in
    {
      nixosConfigurations = {
        catcolab = nixpkgs.lib.nixosSystem {
          specialArgs = { inherit inputs; };
          system = "x86_64-linux";
          modules = [
            ./infrastructure/hosts/catcolab
            agenix.nixosModules.age
          ];
        };

        catcolab-next = nixpkgs.lib.nixosSystem {
          specialArgs = { inherit inputs; };
          system = "x86_64-linux";
          modules = [
            ./infrastructure/hosts/catcolab-next
            agenix.nixosModules.age
          ];
        };

        catcolab-jmoggr = nixpkgs.lib.nixosSystem {
          specialArgs = { inherit inputs; };
          system = "x86_64-linux";
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
            path = deploy-rs.lib.x86_64-linux.activate.nixos self.nixosConfigurations.catcolab;
          };
        };
        catcolab-next = {
          hostname = "backend-next.catcolab.org";
          profiles.system = {
            sshUser = "root";
            path = deploy-rs.lib.x86_64-linux.activate.nixos self.nixosConfigurations.catcolab-next;
          };
        };
        catcolab-jmoggr = {
          hostname = "backend-next.jmoggr.com";
          profiles.system = {
            sshUser = "root";
            path = deploy-rs.lib.x86_64-linux.activate.nixos self.nixosConfigurations.catcolab-jmoggr;
          };
        };
      };

      devShells.${system}.default = pkgs.mkShell {
        name = "catcolab-devshell";
        buildInputs =
          with pkgs;
          [
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
          ]
          ++ [
            inputs.agenix.packages.x86_64-linux.agenix
            inputs.deploy-rs.packages.x86_64-linux.default
            inputs.crate2nix.packages.x86_64-linux.default
          ];

        shellHook = ''
          if [ -f packages/backend/.env ]; then
            export $(grep -v '^#' packages/backend/.env | xargs)
          fi
        '';
      };
    };
}
