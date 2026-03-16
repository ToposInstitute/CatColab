{
  nixpkgs,
  deploy-rs,
  inputs,
  self,
  pkgsLinux,
  linuxSystem,
  rustToolchainLinux,
}:
let
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

  nixosConfigurations = {
    catcolab = nixpkgs.lib.nixosSystem {
      specialArgs = {
        inherit inputs self;
        rustToolchain = rustToolchainLinux;
      };
      system = linuxSystem;
      modules = [
        ./catcolab
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
        ./catcolab-next
      ];
      pkgs = pkgsLinux;
    };

    catcolab-vm = nixpkgs.lib.nixosSystem {
      system = linuxSystem;
      modules = [
        ./catcolab-vm
      ];
      specialArgs = {
        inherit inputs self;
        rustToolchain = rustToolchainLinux;
      };
    };
  };
in
{
  inherit nixosConfigurations;

  deployNodes = {
    catcolab = {
      hostname = "backend.catcolab.org";
      profiles.system = {
        sshUser = "catcolab";
        user = "root";
        path = deploy-rs.lib.${linuxSystem}.activate.nixos nixosConfigurations.catcolab;
      };
    };
    catcolab-next = {
      hostname = "backend-next.catcolab.org";
      profiles.system = {
        sshUser = "catcolab";
        user = "root";
        path = deploy-rs.lib.${linuxSystem}.activate.nixos nixosConfigurations.catcolab-next;
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
        path = deploy-rs.lib.${linuxSystem}.activate.nixos nixosConfigurations.catcolab-vm;
        user = "root";
      };
    };
  };
}
