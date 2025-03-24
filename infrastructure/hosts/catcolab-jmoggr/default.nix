{
  inputs,
  lib,
  pkgs,
  ...
}:
let
  owen = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIF2sBTuqGoEXRWpBRqTBwZZPDdLGGJ0GQcuX5dfIZKb4 o@red-special";
  epatters = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIAKXx6wMJSeYKCHNmbyR803RQ72uto9uYsHhAPPWNl2D evan@epatters.org";
  jmoggr = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIMiaHaeJ5PQL0mka/lY1yGXIs/bDK85uY1O3mLySnwHd j@jmoggr.com";
  catcolabnextDeployuserKey = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOXGvHcfDo2aHyLqaMH+POGhySJ4pOmCiL7RRGxboPuK jmoggrDeployuser";

  # This script is run when deployuser logs in via ssh.
  # Modifications to this script (like changing the branch name), should be manually deployed with
  # deploy-rs. 'Dangerous' changes to system configuration like modifying users or changing network setting
  # should also be done with deploy-rs to take advantage of the rollback system.
  deployuserScript = pkgs.writeShellScriptBin "deployuser-script" ''
    #!/usr/bin/env bash
    set -ex

    branch="nixification"

    if [ -d "catcolab" ]; then
      rm -rf ./catcolab
    fi

    git clone -b "$branch" https://github.com/ToposInstitute/CatColab.git catcolab
    cd catcolab

    sudo /run/current-system/sw/bin/nixos-rebuild switch --flake .#catcolab-jmoggr
  '';
in
{
  imports = [
    ./backend.nix
    "${inputs.nixpkgs}/nixos/modules/virtualisation/amazon-image.nix"
  ];

  networking.hostName = "catcolab-next";
  networking.firewall.allowedTCPPorts = [
    80
    443
  ];

  security.sudo.wheelNeedsPassword = false;
  # security.acme.acceptTerms = true;
  # security.acme.defaults.email = "owen@topos.institute";

  users.mutableUsers = false;

  users.groups.catcolab = { };

  users.users.catcolab = {
    isNormalUser = true;
    group = "catcolab";
    openssh.authorizedKeys.keys = [
      owen
      epatters
      jmoggr
    ];
  };

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

  users.users.jmoggr = {
    isNormalUser = true;
    extraGroups = [ "wheel" ];
    openssh.authorizedKeys.keys = [ jmoggr ];
  };

  users.users.root.openssh.authorizedKeys.keys = [
    owen
    epatters
    jmoggr
  ];

  users.users.deployuser = {
    isNormalUser = true;
    openssh.authorizedKeys.keys = [
      ''
        command="${lib.getExe deployuserScript}",no-port-forwarding,no-agent-forwarding,no-X11-forwarding,no-pty ${catcolabnextDeployuserKey}
      ''
    ];
    extraGroups = [ "catcolab" ];
  };

  security.sudo.extraRules = [
    {
      users = [
        "deployuser"
      ];
      commands = [
        {
          command = "/run/current-system/sw/bin/nixos-rebuild";
          options = [ "NOPASSWD" ];
        }
      ];
    }
  ];

  # new files should be group writeable. Default is 0022
  environment.extraInit = ''
    umask 0002
  '';

  environment.systemPackages = with pkgs; [ git ] ++ [ deployuserScript ];

  time.timeZone = "America/New_York";

  services.openssh.enable = true;

  system.stateVersion = "24.05";

  nix.extraOptions = ''
    experimental-features = nix-command flakes
  '';
}
