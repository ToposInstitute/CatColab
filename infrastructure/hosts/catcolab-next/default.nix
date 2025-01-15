{ inputs, ... }:

let
    owen     = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIF2sBTuqGoEXRWpBRqTBwZZPDdLGGJ0GQcuX5dfIZKb4 o@red-special";
    epatters = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIAKXx6wMJSeYKCHNmbyR803RQ72uto9uYsHhAPPWNl2D evan@epatters.org";
    shaowei  = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOV/7Vnjn7PwOC9VWyRAvsh5lUieIBHgdf4RRLkL8ZPa shaowei@gmail.com";
in
{
    imports = [
        ./backend.nix
        "${inputs.nixpkgs}/nixos/modules/virtualisation/amazon-image.nix"
    ];

    networking.hostName = "catcolab-next";
    networking.firewall.allowedTCPPorts = [ 80 443 ];

    security.sudo.wheelNeedsPassword = false;
    security.acme.acceptTerms = true;
    security.acme.defaults.email = "owen@topos.institute";

    users.mutableUsers = false;

    users.users.owen = {
        isNormalUser = true;
        extraGroups = [ "wheel" ]; # Enable ‘sudo’ for the user.
        openssh.authorizedKeys.keys = [ owen ];
    };

    users.users.epatters = {
        isNormalUser = true;
        extraGroups = [ "wheel" ];
        openssh.authorizedKeys.keys = [ epatters ];
    };

    users.users.shaowei = {
        isNormalUser = true;
        extraGroups = [ "wheel" ];
        openssh.authorizedKeys.keys = [ shaowei ];
    };

    users.users.root.openssh.authorizedKeys.keys = [ owen epatters shaowei ];

    time.timeZone = "America/New_York";

    services.openssh.enable = true;

    system.stateVersion = "24.05";

    nix.extraOptions = ''
        experimental-features = nix-command flakes
    '';
}
