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
    sudoPasswordHash = mkOption {
      type = types.str;
      description = "Hashed password for sudo authentication. Generate with: mkpasswd";
    };
    rootKeys = mkOption {
      type = types.listOf types.str;
      description = "SSH public keys for root access only (e.g., for CI deployment).";
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
          hashedPassword = config.catcolab.host.sudoPasswordHash;
        };

        # Used for deploying from CI to bypass sudo passowrd on catcolab user
        root.openssh.authorizedKeys.keys = config.catcolab.host.rootKeys;
      };

      groups.catcolab = { };
      mutableUsers = false;
    };

    services.openssh = {
      enable = true;
      settings.PasswordAuthentication = false;
    };

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
