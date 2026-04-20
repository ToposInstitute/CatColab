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

  juliaFhsPkg = self.packages.${pkgs.system}.julia-fhs;
  juliaProjectPath = "${self}/packages/algjulia-interop";
  juliaDepotPath = "/var/lib/catcolab/julia-depot";

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
    julia = {
      enable = mkOption {
        type = types.bool;
        default = false;
        description = "Enable the Julia compute service.";
      };
      port = mkOption {
        type = types.port;
        default = 8080;
        description = "Port for the Julia compute service.";
      };
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
      ]
      ++ lib.optionals cfg.julia.enable [
        "julia-interop.service"
      ];
      wants = [
        "database-setup.service"
        "network-online.target"
      ]
      ++ lib.optionals cfg.julia.enable [
        "julia-interop.service"
      ];

      environment = lib.mkMerge [
        { PORT = backendPortStr; }
        (lib.mkIf cfg.backend.serveFrontend { SPA_DIR = "${frontendPkg}"; })
        (lib.mkIf cfg.julia.enable { JULIA_URL = "http://127.0.0.1:${builtins.toString cfg.julia.port}"; })
      ];

      serviceConfig = {
        User = "catcolab";
        Type = "notify";
        Restart = "on-failure";
        TimeoutStartSec = "600s";
        ExecStart = lib.getExe backendPkg;
        EnvironmentFile = cfg.environmentFile;
      };
    };

    systemd.services.julia-interop = lib.mkIf cfg.julia.enable {
      description = "CatColab Julia compute service";
      wantedBy = [ "multi-user.target" ];
      after = [ "network-online.target" ];
      wants = [ "network-online.target" ];

      environment = {
        JULIA_PORT = builtins.toString cfg.julia.port;
        JULIA_DEPOT_PATH = juliaDepotPath;
        # Redirect HOME away from /home/catcolab, which is inaccessible under
        # ProtectHome=true. Without this, Julia's terminfo lookup crashes with
        # EACCES when it tries to stat("~/.terminfo").
        HOME = juliaDepotPath;
      };

      serviceConfig = {
        User = "catcolab";
        Type = "simple";
        Restart = "on-failure";
        RestartSec = "10s";
        TimeoutStartSec = "600s";
        CPUQuota = "200%";
        MemoryMax = "4G";
        MemoryHigh = "3G";
        StateDirectory = lib.removePrefix "/var/lib/" juliaDepotPath;
        ExecStartPre = "${juliaFhsPkg}/bin/julia-interop --project=${juliaProjectPath} -e 'using Pkg; Pkg.instantiate()'";
        ExecStart = "${juliaFhsPkg}/bin/julia-interop --project=${juliaProjectPath} --threads auto ${juliaProjectPath}/scripts/endpoint.jl Catlab";
        # Security hardening. The following are incompatible and excluded:
        # - MemoryDenyWriteExecute: Julia's JIT and PCRE regex JIT need W^X memory.
        # - ProtectProc/ProcSubset: bwrap reads /proc/sys/kernel/overflowuid.
        # - RestrictNamespaces: bwrap needs user namespaces.
        # - PrivateDevices: breaks bwrap device access.
        NoNewPrivileges = true;
        ProtectSystem = "strict";
        ProtectHome = true;
        PrivateTmp = true;
        ProtectKernelTunables = true;
        ProtectKernelModules = true;
        ProtectKernelLogs = true;
        ProtectControlGroups = true;
        ProtectClock = true;
        ProtectHostname = true;
        RestrictSUIDSGID = true;
        RestrictRealtime = true;
        RestrictAddressFamilies = [
          "AF_INET"
          "AF_INET6"
          "AF_UNIX"
        ];
        LockPersonality = true;
        RemoveIPC = true;
        SystemCallArchitectures = "native";
        CapabilityBoundingSet = "";
        UMask = "0077";
        ReadWritePaths = juliaDepotPath;
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
