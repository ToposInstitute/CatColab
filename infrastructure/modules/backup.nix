{
  pkgs,
  lib,
  config,
  inputs,
  ...
}:
let
  backupScript = pkgs.writeShellScriptBin "backup-script" ''
    #!/usr/bin/env bash
    set -ex

    DUMPFILE="db_$(date +%F_%H-%M-%S).sql"

    cd ~
    pg_dump catcolab > $DUMPFILE

    rclone --config="/run/agenix/rclone.conf" copy "$DUMPFILE" backup:catcolab

    echo "Uploaded database dump $DUMPFILE"
    rm $DUMPFILE
  '';
in
with lib;
{
  config = {
    # TODO: secrets should probably be defined in the hosts config
    age.secrets = {
      "rclone.conf" = {
        file = "${inputs.self}/infrastructure/secrets/rclone.conf.age";
        mode = "400";
        owner = "catcolab";
      };
      backendSecretsForCatcolab = {
        file = "${inputs.self}/infrastructure/secrets/.env.prod.age";
        name = "backend-secrets-for-catcolab.env";
        owner = "catcolab";
      };
    };

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
