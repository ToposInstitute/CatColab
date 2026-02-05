{
  config,
  inputs,
  modulesPath,
  ...
}:
let
  keys = import ../../ssh-keys.nix;
in
{
  imports = [
    ../../modules/catcolab
    "${modulesPath}/virtualisation/amazon-image.nix"
    inputs.agenix.nixosModules.age
  ];

  age.secrets = {
    rcloneConf = {
      file = ../../secrets/rclone.conf.next.age;
      mode = "400";
      owner = "catcolab";
    };

    catcolabSecrets = {
      file = ../../secrets/env.next.age;
      mode = "400";
      owner = "catcolab";
    };
  };

  catcolab = {
    enable = true;
    backend = {
      port = 8000;
      hostname = "backend-next.catcolab.org";
    };
    environmentFile = config.age.secrets.catcolabSecrets.path;
    host = {
      enable = true;
      userKeys = keys.hosts.catcolab-next.userKeys;
      sudoPasswordHash = "$y$j9T$Gvhb3z8dNG2Gzk5STLY2q0$w8hilnb9bC2aNuH8Vx4FpgRzotKpFJeF2oFQ24MGMK8";
      backup = {
        enable = true;
        rcloneConfigFile = config.age.secrets.rcloneConf.path;
        destination = "backup:catcolab-next";
      };
    };
  };

  networking.hostName = "catcolab-next";
  time.timeZone = "America/New_York";
  system.stateVersion = "24.05";
}
