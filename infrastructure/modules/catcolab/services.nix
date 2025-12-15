{
  lib,
  pkgs,
  config,
  self,
  ...
}:
let
  cfg = config.catcolab;

  frontendPkg = self.packages.${pkgs.system}.frontend;
  backendPkg = self.packages.${pkgs.system}.backend;

  backendPortStr = builtins.toString cfg.backend.port;

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
in
with lib;
{
  options.catcolab = {
    enable = lib.mkEnableOption "Catcolab services";

    enableCaddy = mkOption {
      type = types.bool;
      default = true;
      description = "Enable Caddy reverse proxy for the backend and automerge services.";
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
      serveFrontend = lib.mkEnableOption "serving the frontend.";
    };
    environmentFile = mkOption {
      type = types.path;
      description = ''
        Path to the EnvironmentFile used by Catcolab services, must be readable by the
        catcolab user
      '';
    };
  };

  config = lib.mkIf cfg.enable {
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

    networking.firewall.allowedTCPPorts = lib.mkIf cfg.enableCaddy [
      80
      443
    ];

    environment.systemPackages = [
      backendPkg
      databaseSetupScript
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
        EnvironmentFile = cfg.environmentFile;
      };
    };

    systemd.services.backend = {
      enable = true;
      wantedBy = [ "multi-user.target" ];
      after = [
        "database-setup.service"
        "network-online.target"
      ];
      wants = [
        "database-setup.service"
        "network-online.target"
      ];

      environment = lib.mkMerge [
        { PORT = backendPortStr; }
        (lib.mkIf cfg.backend.serveFrontend { SPA_DIR = "${frontendPkg}"; })
      ];

      serviceConfig = {
        User = "catcolab";
        Type = "simple";
        Restart = "on-failure";
        ExecStart = lib.getExe backendPkg;
        EnvironmentFile = cfg.environmentFile;
      };
    };

    services.caddy = lib.mkIf cfg.enableCaddy {
      enable = true;
      virtualHosts = {
        "${cfg.backend.hostname}" = {
          extraConfig = ''
            reverse_proxy :${backendPortStr}
          '';
        };
      };
    };
  };
}
