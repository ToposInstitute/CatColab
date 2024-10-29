{
  description = "configurations for deploying catcolab";

  inputs = {
    nixpkgs.url = "nixpkgs/24.05";

    agenix.url = "github:ryantm/agenix";

    deploy-rs.url = "github:serokell/deploy-rs";
  };

  outputs = { self, nixpkgs, agenix, deploy-rs, ... }@inputs:
    let
      system = "x86_64-linux";
      pkgs = import nixpkgs {
        inherit system;
        config.allowUnfree = true;
      };
      lib = nixpkgs.lib.extend
        (self: super: {
          catcolab = import ./lib { inherit pkgs inputs; lib = self; };
        });
      modules = [
        agenix.nixosModules.age
      ];
      mkSystemProfile = name: {
        user = "root";
        sshUser = "root";
        path = deploy-rs.lib.x86_64-linux.activate.nixos self.nixosConfigurations.${name};
      };
    in
      with lib; with catcolab; {
        nixosConfigurations = mapHosts ./hosts { inherit modules self inputs; };

        deploy.nodes = {
          catcolab = {
            hostname = "ec2-3-129-12-223.us-east-2.compute.amazonaws.com";
            profiles.system = mkSystemProfile "catcolab" // {
              sshUser = "root";
            };
          };
          catcolab-next = {
            hostname = "ec2-18-191-165-64.us-east-2.compute.amazonaws.com";
            profiles.system = mkSystemProfile "catcolab-next" // {
              sshUser = "root";
            };
          };
        };

        devShells.${system}.default = import ./shell { inherit self pkgs inputs; };
      };
}
