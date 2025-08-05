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

    ${lib.getExe pkgs.rclone} \
      --config="${builtins.toString config.catcolab.host.backup.rcloneConfFilePath}" \
      copy "$DUMPFILE" backup:${builtins.toString config.catcolab.host.backup.dbBucket}

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
        EnvironmentFile = config.catcolab.host.backup.rcloneConfFilePath;
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
          --property=EnvironmentFile=${config.catcolab.host.backup.rcloneConfFilePath} \
          --property=Environment=PATH=/run/current-system/sw/bin \
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
