{
  lib,
  config,
  inputs,
  ...
}:
with lib;
{
  options.catcolabHost = {
    userKeys = mkOption {
      type = types.listOf types.str;
      description = "SSH public keys to access the catcolab user and the root user.";
      default = [ ];
    };
  };

  config = {
    users = {
      users = {
        catcolab = {
          isNormalUser = true;
          extraGroups = [ "wheel" ];
          openssh.authorizedKeys.keys = config.catcolabHost.userKeys;
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
