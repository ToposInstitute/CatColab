{ inputs, ... }:

{
  imports = [
      ./catcolab.nix
      "${inputs.nixpkgs}/nixos/modules/virtualisation/amazon-image.nix"
  ];

  networking.hostName = "catcolab";

  security.sudo.wheelNeedsPassword = false;

  users.mutableUsers = false;

  users.users.o = {
    isNormalUser = true;
    extraGroups = [ "wheel" ]; # Enable ‘sudo’ for the user.
    openssh.authorizedKeys.keys = [
      "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIF2sBTuqGoEXRWpBRqTBwZZPDdLGGJ0GQcuX5dfIZKb4 o@red-special"
    ];
  };

  users.users.epatters = {
    isNormalUser = true;
    extraGroups = [ "wheel" ];
    openssh.authorizedKeys.keys = [
      "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIAKXx6wMJSeYKCHNmbyR803RQ72uto9uYsHhAPPWNl2D evan@epatters.org"
    ];
  };

  users.users.root.openssh.authorizedKeys.keys = [
    "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIF2sBTuqGoEXRWpBRqTBwZZPDdLGGJ0GQcuX5dfIZKb4 o@red-special"
    "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIAKXx6wMJSeYKCHNmbyR803RQ72uto9uYsHhAPPWNl2D evan@epatters.org"
  ];

  time.timeZone = "America/New_York";

  # Enable the OpenSSH daemon.
  services.openssh.enable = true;

  system.stateVersion = "24.05";

  security.acme.acceptTerms = true;
  security.acme.defaults.email = "owen@topos.institute";

  nix.extraOptions = ''
    experimental-features = nix-command flakes
  '';

  networking.firewall.allowedTCPPorts = [ 80 443 ];
}
