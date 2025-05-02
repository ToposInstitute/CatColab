{ inputs, ... }:

let
  owen = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIF2sBTuqGoEXRWpBRqTBwZZPDdLGGJ0GQcuX5dfIZKb4 o@red-special";
  epatters = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIAKXx6wMJSeYKCHNmbyR803RQ72uto9uYsHhAPPWNl2D evan@epatters.org";
  catcolab-deployuser = "TODO";
in
{
  imports = [
    ../../modules/backend.nix
    ../../modules/host.nix
    ../../modules/backup.nix
    "${inputs.nixpkgs}/nixos/modules/virtualisation/amazon-image.nix"
  ];

  age.secrets = {
    "rclone.conf" = {
      file = "${inputs.self}/infrastructure/secrets/rclone.conf.age";
      mode = "400";
      owner = "catcolab";
    };
    backendSecretsForCatcolab = {
      file = "${inputs.self}/infrastructure/secrets/.env.prod.age";
      name = "backend-secrets-for-catcolab.env";
      owner = "catcolab";
    };
    backendSecretsForPostgres = {
      file = "${inputs.self}/infrastructure/secrets/.env.prod.age";
      name = "backend-secrets-for-postgres.env";
      owner = "postgres";
    };
  };

  catcolab = {
    backend = {
      backendPort = "8000";
      automergePort = "8010";
      backendHostname = "backend.catcolab.org";
      automergeHostname = "automerge.catcolab.org";
    };
    host = {
      userKeys = [
        owen
        epatters
      ];
      deployuserKey = catcolab-deployuser;
    };
  };

  networking.hostName = "catcolab";
  time.timeZone = "America/New_York";
  system.stateVersion = "24.05";
}
