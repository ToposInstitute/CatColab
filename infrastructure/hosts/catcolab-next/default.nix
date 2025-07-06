{
  inputs,
  modulesPath,
  config,
  ...
}:
let
  owen = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIF2sBTuqGoEXRWpBRqTBwZZPDdLGGJ0GQcuX5dfIZKb4 o@red-special";
  epatters = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIAKXx6wMJSeYKCHNmbyR803RQ72uto9uYsHhAPPWNl2D evan@epatters.org";
  jmoggr = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIMiaHaeJ5PQL0mka/lY1yGXIs/bDK85uY1O3mLySnwHd j@jmoggr.com";
in
{
  imports = [
    ../../modules/catcolab.nix
    ../../modules/catcolab-backup.nix
    ../../modules/catcolab-host.nix
    "${modulesPath}/virtualisation/amazon-image.nix"
    inputs.agenix.nixosModules.age
  ];

  age.secrets = {
    "rclone.conf" = {
      file = ../../secrets/rclone.conf.prod.age;
      mode = "400";
      owner = "catcolab";
    };
    catcolabSecrets = {
      file = ../../secrets/.env.next.age;
      owner = "catcolab";
    };
  };

  catcolabHost = {
    userKeys = [
      owen
      epatters
      jmoggr
    ];
  };

  catcolabBackup = {
    rcloneConfFilePath = config.age.secrets."rclone.conf".path;
    backupdbBucket = "catcolab";
  };

  catcolab = {
    backendPort = 8000;
    automergePort = 8010;
    backendHostname = "backend-next.catcolab.org";
    automergeHostname = "automerge-next.catcolab.org";
    environmentFilePath = config.age.secrets.catcolabSecrets.path;
  };

  networking.hostName = "catcolab";
  time.timeZone = "America/New_York";
  system.stateVersion = "24.05";
}
