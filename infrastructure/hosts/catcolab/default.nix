{
  config,
  inputs,
  modulesPath,
  ...
}:
let
  jmoggr = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIMiaHaeJ5PQL0mka/lY1yGXIs/bDK85uY1O3mLySnwHd j@jmoggr.com";
  owen = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIF2sBTuqGoEXRWpBRqTBwZZPDdLGGJ0GQcuX5dfIZKb4 o@red-special";
  epatters = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIAKXx6wMJSeYKCHNmbyR803RQ72uto9uYsHhAPPWNl2D evan@epatters.org";
in
{
  imports = [
    ../../modules/catcolab
    "${modulesPath}/virtualisation/amazon-image.nix"
    inputs.agenix.nixosModules.age
  ];

  age.secrets = {
    rcloneConf = {
      file = ../../secrets/rclone.conf.prod.age;
      mode = "400";
      owner = "catcolab";
    };
    catcolabSecrets = {
      file = ../../secrets/.env.prod.age;
      owner = "catcolab";
    };
  };

  catcolab = {
    enable = true;
    backend = {
      port = 8000;
      hostname = "backend.catcolab.org";
    };
    automerge = {
      port = 8010;
      hostname = "automerge.catcolab.org";
    };
    environmentFilePath = config.age.secrets.catcolabSecrets.path;
    host = {
      enable = true;
      userKeys = [
        owen
        epatters
        jmoggr
      ];
      backup = {
        enable = true;
        rcloneConfFilePath = config.age.secrets.rcloneConf.path;
        dbBucket = "catcolab";
      };
    };
  };

  networking.hostName = "catcolab";
  time.timeZone = "America/New_York";
  system.stateVersion = "24.05";
}
