{
  inputs,
  modulesPath,
  config,
  ...
}:
let
  owen = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIF2sBTuqGoEXRWpBRqTBwZZPDdLGGJ0GQcuX5dfIZKb4 o@red-special";
  epatters = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIAKXx6wMJSeYKCHNmbyR803RQ72uto9uYsHhAPPWNl2D evan@epatters.org";
  catcolab-next-deployuser = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIM7AYg1fZM0zMxb/BuZTSwK4O3ycUIHruApr1tKoO8nJ deployuser@next.catcolab.org";
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
      file = ../../secrets/.env.prod.age;
      owner = "catcolab";
    };
  };

  catcolabHost = {
    userKeys = [
      owen
      epatters
      catcolab-next-deployuser
    ];
  };

  catcolabBackup = {
    rcloneConfFilePath = config.age.secrets."rclone.conf".path;
    backupdbBucket = "catcolab";
  };

  catcolab = {
    backendPort = 8000;
    automergePort = 8010;
    backendHostname = "backend.catcolab.org";
    automergeHostname = "automerge.catcolab.org";
    environmentFilePath = config.age.secrets.catcolabSecrets.path;
  };

  networking.hostName = "catcolab";
  time.timeZone = "America/New_York";
  system.stateVersion = "24.05";
}
