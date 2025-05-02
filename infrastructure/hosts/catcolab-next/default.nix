{
  inputs,
  ...
}:
let
  owen = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIF2sBTuqGoEXRWpBRqTBwZZPDdLGGJ0GQcuX5dfIZKb4 o@red-special";
  epatters = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIAKXx6wMJSeYKCHNmbyR803RQ72uto9uYsHhAPPWNl2D evan@epatters.org";
  jmoggr = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIMiaHaeJ5PQL0mka/lY1yGXIs/bDK85uY1O3mLySnwHd j@jmoggr.com";
  catcolab-next-deployuser = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIM7AYg1fZM0zMxb/BuZTSwK4O3ycUIHruApr1tKoO8nJ deployuser@next.catcolab.org";
in
{
  imports = [
    ../../modules/backend.nix
    ../../modules/host.nix
    "${inputs.nixpkgs}/nixos/modules/virtualisation/amazon-image.nix"
  ];

  age.secrets = {
    backendSecretsForCatcolab = {
      file = "${inputs.self}/infrastructure/secrets/.env.next.age";
      name = "backend-secrets-for-catcolab.env";
      owner = "catcolab";
    };
    backendSecretsForPostgres = {
      file = "${inputs.self}/infrastructure/secrets/.env.next.age";
      name = "backend-secrets-for-postgres.env";
      owner = "postgres";
    };
  };

  catcolab = {
    backend = {
      backendPort = "8000";
      automergePort = "8010";
      backendHostname = "backend-next.catcolab.org";
      automergeHostname = "automerge-next.catcolab.org";
    };
    host = {
      userKeys = [
        owen
        epatters
        jmoggr
      ];
      deployuserKey = catcolab-next-deployuser;
    };
  };

  networking.hostName = "catcolab-next";
  time.timeZone = "America/New_York";
  system.stateVersion = "24.05";
}
