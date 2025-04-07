{
  lib,
  config,
  ...
}:
with lib;
{
  options.catcolab.host = {
    userKeys = mkOption {
      type = types.listOf types.str;
      description = "SSH public keys to access the catcolab user and the root user.";
    };
    deployuserKey = mkOption {
      type = types.str;
      description = "SSH public key of deployuser";
    };
  };

  config = {
    users = {
      users = {
        catcolab = {
          isNormalUser = true;
          group = "catcolab";
          openssh.authorizedKeys.keys = config.catcolab.host.userKeys;
        };
        deployuser = {
          isNormalUser = true;
          openssh.authorizedKeys.keys = [ config.catcolab.host.deployuserKey ];
          extraGroups = [ "catcolab" ];
        };
        root.openssh.authorizedKeys.keys = config.catcolab.host.userKeys;
      };

      groups.catcolab = { };
      mutableUsers = false;
    };

    security.sudo = {
      wheelNeedsPassword = false;
      extraRules = [
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
    };

    networking.firewall.allowedTCPPorts = [
      80
      443
    ];

    services.openssh.enable = true;
    nix.extraOptions = ''
      experimental-features = nix-command flakes
    '';
  };
}
