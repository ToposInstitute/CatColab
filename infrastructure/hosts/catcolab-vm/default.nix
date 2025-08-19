{
  config,
  lib,
  modulesPath,
  ...
}:
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
    hostname = "catcolab.org";
    backend = {
      port = 8000;
    };
    automerge = {
      port = 8010;
    };
    environmentFilePath = /etc/catcolab/catcolab-secrets.env;
    host = {
      enable = true;
      userKeys = (import ./keys.nix).keys;
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
    config.catcolab.automerge.port
    5432
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

  time.timeZone = "UTC";
  system.stateVersion = "25.05";
}
