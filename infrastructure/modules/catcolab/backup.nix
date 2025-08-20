{
  pkgs,
  lib,
  config,
  self,
  ...
}:
let
  backupScript = pkgs.writeShellScriptBin "backup-script" ''
    #!/usr/bin/env bash
    set -e

    DUMPFILE="db_$(date +%F_%H-%M-%S).sql"

    ${lib.getExe self.packages.x86_64-linux.migrator} list
    cd ~

    echo "database url: $DATABASE_URL"
    echo "pguser: $PGUSER"

    ${pkgs.postgresql}/bin/pg_dump --clean --if-exists > $DUMPFILE

    BACKUP_BUCKET="backup:${builtins.toString config.catcolab.host.backup.dbBucket}"
    RCLONE_CONFIG_PATH="${builtins.toString config.catcolab.host.backup.rcloneConfFilePath}"

    ${lib.getExe pkgs.rclone} --config="$RCLONE_CONFIG_PATH" \
      copy "$DUMPFILE" "$BACKUP_BUCKET"

    echo "Uploaded database backup $DUMPFILE to $BACKUP_BUCKET"
    rm $DUMPFILE
  '';

  migrationScript = pkgs.writeShellScriptBin "migration-script" ''
    if $(${lib.getExe self.packages.x86_64-linux.migrator} list) 2>/dev/null | grep -q '✗'; then
      echo "migration to run"
    else
      echo "no migrations to run"
    fi
  '';

  activationScript = pkgs.writeShellScriptBin "activation-script" ''
    ${lib.getExe backupScript}
    ${lib.getExe migrationScript}
  '';
in
with lib;
{
  options.catcolab.host.backup = {
    enable = mkOption {
      type = types.bool;
      default = false;
      description = "Enable automated backups of the Catcolab database to a Backblaze bucket.";
    };
    dbBucket = mkOption {
      type = types.nullOr types.str;
      default = null;
      description = ''
        Name of the Backblaze bucket used for database backups.
      '';
    };

    rcloneConfFilePath = mkOption {
      type = types.nullOr types.path;
      default = null;
      description = "Path to your rclone.conf.";
    };
  };

  config = lib.mkIf config.catcolab.host.backup.enable {
    systemd.timers.backupdb = {
      wantedBy = [ "timers.target" ];
      timerConfig = {
        OnCalendar = "daily";
        Persistent = true;
        Unit = "backupdb.service";
      };
    };

    systemd.services.backupdb = {
      serviceConfig = {
        User = "catcolab";
        ExecStart = getExe backupScript;
        Type = "oneshot";
        EnvironmentFile = config.catcolab.environmentFilePath;
      };
    };

    # run backup script at end of deploy to act as a canary for the backup script
    system.activationScripts.backupdb = {
      text = ''
        echo "Running backupdb script as a transient systemd unit..."

        ${pkgs.systemd}/bin/systemd-run --system --wait \
          --unit=backupdb-activation \
          --description="One-off activation backupdb" \
          --property=Type=${config.systemd.services.backupdb.serviceConfig.Type} \
          --property=User=${config.systemd.services.backupdb.serviceConfig.User} \
          --property=EnvironmentFile=${config.catcolab.environmentFilePath} \
          --property=Environment=PATH=/run/current-system/sw/bin \
          ${lib.getExe activationScript}

        exit_code=$?

        journalctl \
          --unit=backupdb-activation \
          --invocation=0 \
          --quiet \
          --output=cat \
          --identifier=activation-script

        if [ $exit_code -ne 0 ]; then
          echo "activation‐time backup failed with code $exit_code"
          exit "$exit_code"
        fi
      '';
    };

    # install all packages used in this module
    environment.systemPackages =
      with pkgs;
      [
        postgresql
        rclone
        bash
      ]

      ++ [ backupScript ];
  };
}
