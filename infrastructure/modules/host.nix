{
  lib,
  pkgs,
  config,
  ...
}:
let
  # This script is run when deployuser logs in via ssh.
  # Modifications to this script (like changing the branch name), should be manually deployed with
  # deploy-rs. 'Dangerous' changes to system configuration like modifying users or changing network setting
  # should also be done with deploy-rs to take advantage of the rollback system.
  deployuserScript = pkgs.writeShellScriptBin "deployuser-script" ''
    #!/usr/bin/env bash
    set -ex

    commit_sha="$SSH_ORIGINAL_COMMAND"

    if [ -z "$commit_sha" ]; then
      echo "Missing commit SHA"
      exit 1
    fi

    if [ -d "catcolab" ]; then
      rm -rf ./catcolab
    fi

    git clone https://github.com/ToposInstitute/CatColab.git catcolab
    cd catcolab
    git checkout "$commit_sha"

    # hostname will return the hosts networking.hostname, which should, by convention match a key in
    # deploy.nodes in flake.nix
    sudo /run/current-system/sw/bin/nixos-rebuild switch --flake .#"$(hostname)"
  '';
in
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
          openssh.authorizedKeys.keys = [
            ''
              command="${lib.getExe deployuserScript}",no-port-forwarding,no-agent-forwarding,no-X11-forwarding,no-pty ${config.catcolab.host.deployuserKey}
            ''
          ];
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

    # install all packages used in this module
    environment.systemPackages =
      with pkgs;
      [
        git
        bash
      ]
      ++ [ deployuserScript ];

    services.openssh.enable = true;
    nix.extraOptions = ''
      experimental-features = nix-command flakes
    '';
  };
}
