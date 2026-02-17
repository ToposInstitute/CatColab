{
  pkgs,
  config,
  lib,
  modulesPath,
  self,
  ...
}:
let
  keys = import ../../ssh-keys.nix;
in
{
  imports = [
    (modulesPath + "/profiles/qemu-guest.nix")
    ../../modules/catcolab
  ];

  environment.etc."catcolab/catcolab-secrets.env" = {
    source = ../../secrets/example-secrets.env;
    mode = "0400";
    user = "catcolab";
    group = "catcolab";
  };

  catcolab = {
    enable = true;
    enableCaddy = false;
    backend = {
      port = 8000;
      hostname = "";
      serveFrontend = true;
    };
    environmentFile = /etc/catcolab/catcolab-secrets.env;
    host = {
      enable = true;
      userKeys = keys.allUserKeys;
      sudoPasswordHash = "$y$j9T$Gvhb3z8dNG2Gzk5STLY2q0$w8hilnb9bC2aNuH8Vx4FpgRzotKpFJeF2oFQ24MGMK8";
    };
  };

  services.postgresql.settings.listen_addresses = lib.mkForce "*";
  services.postgresql.authentication = ''
    # localhost
    host  all  all  127.0.0.1/32  md5
    # QEMU host as seen from the guest
    host  all  all  10.0.2.2/32   md5
  '';

  networking.firewall.allowedTCPPorts = [
    config.catcolab.backend.port
    5432
  ];

  virtualisation.vmVariant = {
    virtualisation.forwardPorts = [
      {
        from = "host";
        host.port = 8000;
        guest.port = 8000;
      }
      {
        from = "host";
        host.port = 2221;
        guest.port = 22;
      }
    ];
  };

  environment.systemPackages = [
    self.packages.${pkgs.system}.frontend-tests
  ];

  # This matches the default root device that is created by nixos-generators
  fileSystems."/".device = "/dev/disk/by-label/nixos";

  virtualisation.diskSize = 20 * 1024;
  services.qemuGuest.enable = true;
  # needed for deploy-rs to works
  boot.loader.grub = {
    enable = true;
    device = "/dev/vda";
  };

  services.getty.autologinUser = "catcolab";

  networking.hostName = "catcolab-vm";
  time.timeZone = "America/New_York";
  system.stateVersion = "24.05";
}
