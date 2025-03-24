{
  description = "configurations for deploying catcolab";

  inputs = {
    nixpkgs.url = "nixpkgs/nixos-unstable";
    agenix.url = "github:ryantm/agenix";
    deploy-rs.url = "github:serokell/deploy-rs";

    # For building rust packages. We need it because the first party `rustPlatform.buildRustPackage` does
    # not work for cargo workspaces: it has a hard requirement that a Cargo.lock exists in the package
    # directory (even though the docs say otherwise). Working around this is possible, but it would
    # require using the whole repository as an input.
    naersk.url = "github:nix-community/naersk";
  };

  outputs =
    {
      self,
      nixpkgs,
      naersk,
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

      catcolabPackages = {
        backend = pkgs.lib.callPackageWith pkgs ./packages/backend/default.nix {
          naersk = pkgs.callPackage naersk { };
        };
        automerge-doc-server =
          pkgs.lib.callPackageWith pkgs ./packages/automerge-doc-server/default.nix
            { };
      };
    in
    {
      nixosConfigurations.catcolab-jmoggr = nixpkgs.lib.nixosSystem {
        specialArgs = { inherit catcolabPackages inputs; };
        system = "x86_64-linux";
        modules = [
          ./infrastructure/hosts/catcolab-jmoggr
          agenix.nixosModules.age
        ];
      };

      deploy.nodes = {
        # catcolab = {
        #   hostname = "ec2-18-191-165-64.us-east-2.compute.amazonaws.com";
        #   profiles.system = mkSystemProfile "catcolab" // {
        #     sshUser = "root";
        #   };
        # };
        # catcolab-next = {
        #   hostname = "ec2-18-217-205-18.us-east-2.compute.amazonaws.com";
        #   profiles.system = mkSystemProfile "catcolab-next" // {
        #     sshUser = "root";
        #   };
        # };
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
          ];
      };
    };
}
