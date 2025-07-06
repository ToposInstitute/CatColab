{
  lib,
  config,
  inputs,
  ...
}:
with lib;
{
  options.catcolab.host = {
    enable = mkOption {
      type = types.bool;
      default = false;
      description = "Master switch for all catcolab configuration.";
    };
    userKeys = mkOption {
      type = types.listOf types.str;
      description = "SSH public keys to access the catcolab user and the root user.";
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
      };

      groups.catcolab = { };
      mutableUsers = false;
    };

    security.sudo = {
      wheelNeedsPassword = false;
    };

    services.openssh.enable = true;
    nix.extraOptions = ''
      experimental-features = nix-command flakes
    '';
  };
}
