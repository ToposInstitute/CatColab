{
  config,
  inputs,
  modulesPath,
  ...
}:
let
  owen = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIF2sBTuqGoEXRWpBRqTBwZZPDdLGGJ0GQcuX5dfIZKb4 o@red-special";
  epatters = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIAKXx6wMJSeYKCHNmbyR803RQ72uto9uYsHhAPPWNl2D evan@epatters.org";
  jmoggr = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIMiaHaeJ5PQL0mka/lY1yGXIs/bDK85uY1O3mLySnwHd j@jmoggr.com";
  kasbah = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIM1K/FB6dCjo1/xfddi9VoHEGchFo/bcz6v7SC7wAuFQ kaspar@topos";
  catcolab-next-deployuser = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIM7AYg1fZM0zMxb/BuZTSwK4O3ycUIHruApr1tKoO8nJ deployuser@next.catcolab.org";
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
      userKeys = [
        owen
        epatters
        jmoggr
        catcolab-next-deployuser
        kasbah
      ];
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
