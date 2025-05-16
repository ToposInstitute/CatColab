{
  lib,
  pkgs,
  inputs,
  config,
  ...
}:
let
  # idempotent script for intializing the catcolab database
  databaseSetupScript = pkgs.writeShellScriptBin "database-setup" ''
    #!/usr/bin/env bash
    set -ex

    # Extract the password from the secret file
    password=$(cat ${config.age.secrets.backendSecretsForPostgres.path} | sed -n 's|.*://[^:]*:\([^@]*\)@.*|\1|p')

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

  databaseMigrationScript = pkgs.writeShellScriptBin "database-migration" ''
    #!/usr/bin/env bash
    set -ex

    # the migrations directory is copied into the output of backend
    cd ${catcolabPackages.backend}
    ${lib.getExe pkgs.sqlx-cli} migrate run
  '';

  catcolabPackages = {
    backend = pkgs.lib.callPackageWith pkgs ../../packages/backend/default.nix {
    };

    automerge-doc-server =
      pkgs.lib.callPackageWith pkgs ../../packages/automerge-doc-server/default.nix
        { };
  };
in
with lib;
{
  options.catcolab.backend = {
    backendPort = mkOption {
      type = types.str;
      default = "8000";
      description = "Port for the backend service.";
    };
    automergePort = mkOption {
      type = types.str;
      default = "8010";
      description = "Port for the automerge service.";
    };
    automergeHostname = mkOption {
      type = types.str;
      description = "Hostname for the automerge reverse proxy.";
    };
    backendHostname = mkOption {
      type = types.str;
      description = "Hostname for the backend reverse proxy.";
    };
  };

  config = {
    services.postgresql = {
      enable = true;
    };

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
      };
    };

    systemd.services.migrations = {
      enable = true;
      after = [ "database-setup.service" ];
      wants = [ "database-setup.service" ];

      serviceConfig = {
        User = "catcolab";
        Type = "oneshot";
        ExecStart = lib.getExe databaseMigrationScript;
        EnvironmentFile = config.age.secrets.backendSecretsForCatcolab.path;
      };
    };

    systemd.services.backend = {
      enable = true;
      wantedBy = [ "multi-user.target" ];
      # after = [ "migrations.service" ];
      # wants = [ "migrations.service" ];
      after = [ "database-setup.service" ];
      wants = [ "database-setup.service" ];

      environment = {
        PORT = config.catcolab.backend.backendPort;
      };

      serviceConfig = {
        User = "catcolab";
        Type = "simple";
        Restart = "on-failure";
        ExecStart = lib.getExe catcolabPackages.backend;
        EnvironmentFile = config.age.secrets.backendSecretsForCatcolab.path;
      };
    };

    systemd.services.automerge = {
      enable = true;
      wantedBy = [ "multi-user.target" ];

      environment = {
        PORT = config.catcolab.backend.automergePort;
      };

      serviceConfig = {
        User = "catcolab";
        ExecStart = "${lib.getExe pkgs.nodejs_23} ${catcolabPackages.automerge-doc-server}/main.cjs";
        Type = "simple";
        Restart = "on-failure";
      };
    };

    services.caddy = {
      enable = true;
      virtualHosts = {
        "${config.catcolab.backend.backendHostname}" = {
          extraConfig = ''
            reverse_proxy :${config.catcolab.backend.backendPort}
          '';
        };

        "${config.catcolab.backend.automergeHostname}" = {
          extraConfig = ''
            reverse_proxy :${config.catcolab.backend.automergePort}
          '';
        };
      };
    };

    # install all packages used in this module
    environment.systemPackages =
      with pkgs;
      [
        nodejs_23
        sqlx-cli
      ]
      ++ [
        databaseSetupScript
        databaseMigrationScript
        catcolabPackages.automerge-doc-server
        catcolabPackages.backend
      ];
  };
}
