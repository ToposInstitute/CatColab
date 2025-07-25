{
  pkgs,
  lib,
  config,
  ...
}:
let
  backupScript = pkgs.writeShellScriptBin "backup-script" ''
    #!/usr/bin/env bash
    set -ex

    DUMPFILE="db_$(date +%F_%H-%M-%S).sql"

    cd ~

    ${pkgs.postgresql}/bin/pg_dump --clean --if-exists > $DUMPFILE

    if [ "${toString config.catcolab.host.backup.test}" = "false" ]; then
      ${lib.getExe pkgs.rclone} \
        --config="${builtins.toString config.catcolab.host.backup.rcloneConfFilePath}" \
        copy "$DUMPFILE" backup:${builtins.toString config.catcolab.host.backup.dbBucket}

      echo "Uploaded database dump $DUMPFILE"
    else
      echo "Test mode: skipping rclone upload"
    fi

    echo "Uploaded database dump $DUMPFILE"
    rm $DUMPFILE
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
        Name of the Backblaze bucket used for database backups. Not required when `catcolab.test = true`.
      '';
    };
    rcloneConfFilePath = mkOption {
      type = types.nullOr types.path;
      default = null;
      description = "Path to your rclone.conf. Not required when `catcolab.test = true`.";
    };
    test = mkOption {
      type = types.bool;
      default = false;
      description = "If true, run pg_dump but skip the rclone upload (for smoke tests).";
    };
  };

  config = lib.mkIf config.catcolab.host.backup.enable {
    assertions = [
      {
        assertion =
          config.catcolab.host.backup.test || config.catcolab.host.backup.rcloneConfFilePath != null;
        message = "You must set catcolab.host.backup.rcloneConfFilePath unless test=true";
      }
      {
        assertion = config.catcolab.host.backup.test || config.catcolab.host.backup.dbBucket != null;
        message = "You must set catcolab.host.backup.dbBucket unless test=true";
      }
    ];

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

        since=$(date --iso-8601=seconds)

        # we can't run the backupdb unit because at this point systemd doesn't know about the new unit,
        # so we run a transient unit with the same config.
        ${pkgs.systemd}/bin/systemd-run --system --wait \
          --unit=backupdb-activation \
          --description="One-off activation backupdb" \
          --property=Type=${config.systemd.services.backupdb.serviceConfig.Type} \
          --property=User=${config.systemd.services.backupdb.serviceConfig.User} \
          --property=Environment=PATH=/run/current-system/sw/bin \
          --property=EnvironmentFile=${config.catcolab.environmentFilePath} \
          ${lib.getExe backupScript}

        exit_code=$?
        if [ $exit_code -ne 0 ]; then
          echo "activation‐time backup failed with code $exit_code"
          ${pkgs.systemd}/bin/journalctl -u backupdb-activation.service --since "$since"
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
