{
  config,
  lib,
  pkgs,
  ...
}:
let
  cfg = config.catcolab.host.backup;

  backupdbScript = pkgs.writeShellApplication {
    name = "backupdb-script";
    runtimeInputs = [
      pkgs.postgresql
      pkgs.rclone
      pkgs.coreutils
    ];
    text = ''
      set -euo pipefail

      tmpdir="$(mktemp -d -t backupdb.XXXXXX)"
      cleanup() { rm -rf -- "$tmpdir"; }
      trap cleanup EXIT

      timestamp="$(date +%F_%H-%M-%S)"
      dumpfile="db_$timestamp.sql"
      dumpfile_path="$tmpdir/$dumpfile"

      pg_dump --clean --if-exists > "$dumpfile_path"

      rclone --config="${builtins.toString cfg.rcloneConfigFile}" \
        copy "$dumpfile_path" "${cfg.destination}"

      echo "Uploaded database backup $dumpfile to ${cfg.destination}"
    '';
  };
in
with lib;
{
  options.catcolab.host.backup = {
    enable = mkEnableOption "automated database backups to a Backblaze bucket via rclone";

    destination = mkOption {
      type = types.str;
      default = null;
      description = ''
        Url of the Backblaze bucket used for database backups.
      '';
    };
    rcloneConfigFile = mkOption {
      type = types.path;
      default = null;
      description = "Path the rclone configuration file.";
    };
  };

  config = lib.mkIf cfg.enable {
    systemd.timers.backupdb = {
      wantedBy = [ "timers.target" ];
      timerConfig = {
        OnCalendar = "daily";
        Persistent = true;
        Unit = "backupdb.service";
      };
    };

    systemd.services.backupdb = {
      after = [ "postgresql.service" ];
      wants = [ "postgresql.service" ];
      serviceConfig = {
        User = "catcolab";
        Type = "oneshot";
        ExecStart = getExe backupdbScript;
      };
    };

    # Run the backup script early in activation, before services are restarted. This ensures that if the
    # activation or new generation damages the DB, we still have a dump from the last known-good state.
    system.activationScripts.backupdb = {
      text = ''
        echo "Running backupdb script..."

        if ! ${pkgs.systemd}/bin/systemctl is-active postgresql.service >/dev/null 2>&1; then
          echo "PostgreSQL is not running. Skipping backup."
          exit 0
        fi

        echo "PostgreSQL is running, proceeding with backup..."
        ${pkgs.util-linux}/bin/runuser -u catcolab -- ${pkgs.bash}/bin/bash -c '
          ${getExe backupdbScript}
        '
      '';
    };

    environment.systemPackages = [
      pkgs.rclone
      backupdbScript
    ];
  };
}
