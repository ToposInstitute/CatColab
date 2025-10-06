{
  lib,
  config,
  pkgs,
  ...
}:
with lib;
{
  options.catcolab.host = {
    enable = mkOption {
      type = types.bool;
      default = false;
      description = "Enable CatColab host mode: configure this machine as a standalone CatColab server.";
    };
    userKeys = mkOption {
      type = types.listOf types.str;
      description = "SSH public keys to access the catcolab user.";
      default = [ ];
    };
  };

  config = lib.mkIf config.catcolab.host.enable {
    users = {
      users = {
        catcolab = {
          isNormalUser = true;
          extraGroups = [ "wheel" ];
          openssh.authorizedKeys.keys = config.catcolab.host.userKeys;
        };
        # TODO: root access can be dropped after the next prod deploy
        root.openssh.authorizedKeys.keys = config.catcolab.host.userKeys;
      };

      groups.catcolab = { };
      mutableUsers = false;
    };

    security.sudo = {
      wheelNeedsPassword = false;
    };

    services.openssh.enable = true;
    nix = {
      settings.trusted-users = [
        "catcolab"
      ];
      extraOptions = ''
        experimental-features = nix-command flakes
      '';
    };

    environment.systemPackages = with pkgs; [
      git
    ];

    programs.nh = {
      enable = true;

      clean = {
        enable = true;
        extraArgs = "--keep 5 --keep-since 5d";
        dates = "weekly";
      };
    };
  };
}
