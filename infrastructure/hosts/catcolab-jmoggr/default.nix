{
  inputs,
  ...
}:
let
  owen = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIF2sBTuqGoEXRWpBRqTBwZZPDdLGGJ0GQcuX5dfIZKb4 o@red-special";
  epatters = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIAKXx6wMJSeYKCHNmbyR803RQ72uto9uYsHhAPPWNl2D evan@epatters.org";
  jmoggr = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIMiaHaeJ5PQL0mka/lY1yGXIs/bDK85uY1O3mLySnwHd j@jmoggr.com";
  catcolab-jmoggr-deployuser = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOXGvHcfDo2aHyLqaMH+POGhySJ4pOmCiL7RRGxboPuK jmoggrDeployuser";
in
{
  imports = [
    ../../modules/backend.nix
    ../../modules/host.nix
    "${inputs.nixpkgs}/nixos/modules/virtualisation/amazon-image.nix"
  ];

  catcolab = {
    backend = {
      backendPort = "8000";
      automergePort = "8010";
      backendHostname = "backend-next.jmoggr.com";
      automergeHostname = "automerge-next.jmoggr.com";
    };
    host = {
      userKeys = [
        owen
        epatters
        jmoggr
      ];
      deployuserKey = catcolab-jmoggr-deployuser;
    };
  };

  networking.hostName = "catcolab-jmoggr";
  time.timeZone = "America/New_York";
  system.stateVersion = "24.05";
}
