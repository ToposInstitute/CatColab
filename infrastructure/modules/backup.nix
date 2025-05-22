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

    "${pkgs.postgresql}/bin/pg_dump" catcolab > $DUMPFILE

    ${lib.getExe pkgs.rclone} --config="/run/agenix/rclone.conf" copy "$DUMPFILE" backup:${config.catcolab.backup.backupdbBucket}

    echo "Uploaded database dump $DUMPFILE"
    rm $DUMPFILE
  '';
in
with lib;
{
  options.catcolab.backup = {
    backupdbBucket = mkOption {
      type = types.str;
      description = "Name of the Backblaze bucket used for database backups";
    };
  };

  config = {
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
        EnvironmentFile = config.age.secrets.backendSecretsForCatcolab.path;
      };
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
