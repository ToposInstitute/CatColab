{
  lib,
  pkgs,
  config,
  rustToolchain,
  inputs,
  self,
  ...
}:
let
  # idempotent script for intializing the catcolab database
  databaseSetupScript = pkgs.writeShellScriptBin "database-setup" ''
    #!/usr/bin/env bash
    set -ex

    # Extract the password from the secret file
    password=$(echo $DATABASE_URL | sed -n 's|.*://[^:]*:\([^@]*\)@.*|\1|p')

    # Create the user only if it doesn't already exist.
    if ! ${pkgs.postgresql}/bin/psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='catcolab'" | grep -q 1; then
      ${pkgs.postgresql}/bin/psql -c "CREATE USER catcolab WITH ENCRYPTED PASSWORD '$password';"
    fi

    # Create the database only if it doesn't already exist.
    if ! ${pkgs.postgresql}/bin/psql -tAc "SELECT 1 FROM pg_database WHERE datname='catcolab'" | grep -q 1; then
      ${pkgs.postgresql}/bin/psql -c "CREATE DATABASE catcolab;"
    fi

    ${pkgs.postgresql}/bin/psql -c "alter database catcolab owner to catcolab;"
    ${pkgs.postgresql}/bin/psql -c "grant all privileges on database catcolab to catcolab;"
    ${pkgs.postgresql}/bin/psql -d catcolab -c "grant all on schema public to catcolab;"
  '';

  catcolabPackages = {
    backend = pkgs.lib.callPackageWith pkgs ../../../packages/backend/default.nix {
      inherit rustToolchain;
    };

    migrator = pkgs.lib.callPackageWith pkgs ../../../packages/migrator/default.nix {
      inherit rustToolchain;
    };

    automerge-doc-server =
      pkgs.lib.callPackageWith pkgs ../../../packages/automerge-doc-server/default.nix
        { inherit inputs rustToolchain self; };
  };

  backendPortStr = builtins.toString config.catcolab.backend.port;
  automergePortStr = builtins.toString config.catcolab.automerge.port;
in
with lib;
{
  options.catcolab = {
    enable = mkOption {
      type = types.bool;
      default = false;
      description = "Whether to enable Catcolab services.";
    };
    backend = {
      port = mkOption {
        type = types.port;
        default = 8000;
        description = "Port for the backend service.";
      };
      hostname = mkOption {
        type = types.str;
        description = "Hostname for the backend reverse proxy.";
      };
    };
    automerge = {
      port = mkOption {
        type = types.port;
        default = 8010;
        description = "Port for the automerge service.";
      };
      hostname = mkOption {
        type = types.str;
        description = "Hostname for the automerge reverse proxy.";
      };
    };
    environmentFilePath = mkOption {
      type = types.path;
      description = ''
        Path to the EnvironmentFile used by Catcolab services, must be readable by the
        catcolab user
      '';
    };
  };

  config = lib.mkIf config.catcolab.enable {
    services.postgresql = {
      enable = true;
    };

    users = {
      users = {
        catcolab = {
          group = "catcolab";
        };
      };

      groups.catcolab = { };
    };

    networking.firewall.allowedTCPPorts = [
      80
      443
    ];

    environment.systemPackages = [
      databaseSetupScript
      catcolabPackages.automerge-doc-server
      catcolabPackages.backend
    ];

    # Database setup and mirgations are run as different services because the database setup requires the
    # use of the priviledged postgres user and the migrations do not
    systemd.services.database-setup = {
      description = "Set up catcolab database and user";
      after = [ "postgresql.service" ];
      wants = [ "postgresql.service" ];

      serviceConfig = {
        Type = "oneshot";
        User = "postgres";
        ExecStart = lib.getExe databaseSetupScript;
        EnvironmentFile = config.catcolab.environmentFilePath;
      };
    };

    systemd.services.migrations = {
      enable = true;
      after = [ "database-setup.service" ];
      wants = [ "database-setup.service" ];

      serviceConfig = {
        User = "catcolab";
        Type = "oneshot";
        ExecStart = "${lib.getExe catcolabPackages.migrator} apply";
        EnvironmentFile = config.catcolab.environmentFilePath;
        Environment = ''
          PATH=${lib.makeBinPath [ catcolabPackages.automerge-doc-server ]}:$PATH
        '';
      };
    };

    systemd.services.backend = {
      enable = true;
      wantedBy = [ "multi-user.target" ];
      after = [
        "migrations.service"
        "network-online.target"
      ];
      wants = [
        "migrations.service"
        "network-online.target"
      ];

      environment = {
        PORT = backendPortStr;
      };

      serviceConfig = {
        User = "catcolab";
        Type = "simple";
        Restart = "on-failure";
        ExecStart = lib.getExe catcolabPackages.backend;
        EnvironmentFile = config.catcolab.environmentFilePath;
      };
    };

    systemd.services.automerge = {
      enable = true;
      wantedBy = [ "multi-user.target" ];

      environment = {
        PORT = automergePortStr;
      };

      serviceConfig = {
        EnvironmentFile = config.catcolab.environmentFilePath;
        User = "catcolab";
        ExecStart = lib.getExe catcolabPackages.automerge-doc-server;
        Type = "simple";
        Restart = "on-failure";
      };
    };

    services.caddy = {
      enable = true;
      virtualHosts = {
        "${config.catcolab.backend.hostname}" = {
          extraConfig = ''
            reverse_proxy :${backendPortStr}
          '';
        };

        "${config.catcolab.automerge.hostname}" = {
          extraConfig = ''
            reverse_proxy :${automergePortStr}
          '';
        };
      };
    };
  };
}
