{ inputs, pkgs, config, ... }:

let
    automergePort = "8010";
    backendPort = "8000";

    automergeScript = pkgs.writeShellScript "automerge.sh" ''
        ${pkgs.nodejs}/bin/node dist/automerge-doc-server/src/main.js
    '';

    backendScript = pkgs.writeShellScript "backend.sh" ''
        ln -sf ${config.age.secrets.".env".path} /var/lib/catcolab/packages/backend/
        ../../target/debug/backend
    '';

    initScript = pkgs.writeShellScriptBin "catcolab-init" ''
        echo -e "\n\n##### catcolab-init: cloning catcolab repo...\n\n"
        cd /var/lib
        if [ -z "$1" ]; then branch="main"; else branch="$1"; fi
        git clone -b $branch https://github.com/ToposInstitute/CatColab.git
        mv CatColab catcolab
        chown -R catcolab:catcolab catcolab

        echo -e "\n\n##### catcolab-init: linking secrets...\n\n"
        ln -sf ${config.age.secrets.".env".path} /var/lib/catcolab/packages/backend/
        
        echo -e "\n\n##### catcolab-init: installing nodejs dependencies...\n\n"
        su -l catcolab -c "cd /var/lib/catcolab/packages/backend; pnpm install"

        echo -e "\n\n##### catcolab-init: installing rust and cargo...\n\n"
        su -l catcolab -c "rustup default stable"
        
        echo -e "\n\n##### catcolab-init: installing sqlx-cli for migrations...\n\n"
        su -l catcolab -c "cargo install sqlx-cli"

        echo -e "\n\n##### catcolab-init: setting up postgres user, database, permissions...\n\n"
        su -l postgres -- /var/lib/catcolab/infrastructure/scripts/initdb.sh $(cat ${config.age.secrets.".env".path})

        echo -e "\n\n##### catcolab-init: stopping automerge, build services...\n\n"
        /var/lib/catcolab/infrastructure/scripts/stop.sh

        echo -e "\n\n##### catcolab-init: migrating database...\n\n"
        su -l catcolab -- /var/lib/catcolab/infrastructure/scripts/migrate.sh

        echo -e "\n\n##### catcolab-init: building binaries...\n\n"
        su -l catcolab -- /var/lib/catcolab/infrastructure/scripts/build.sh

        echo -e "\n\n##### catcolab-init: start automerge, build services...\n\n"
        /var/lib/catcolab/infrastructure/scripts/start.sh
    '';

    stopScript = pkgs.writeShellScriptBin "catcolab-stop" ''
        /var/lib/catcolab/infrastructure/scripts/stop.sh
    '';

    startScript = pkgs.writeShellScriptBin "catcolab-start" ''
        /var/lib/catcolab/infrastructure/scripts/start.sh
    '';

    restartScript = pkgs.writeShellScriptBin "catcolab-restart" ''
        /var/lib/catcolab/infrastructure/scripts/restart.sh
    '';

    statusScript = pkgs.writeShellScriptBin "catcolab-status" ''
        /var/lib/catcolab/infrastructure/scripts/status.sh
    '';

    migrateScript = pkgs.writeShellScriptBin "catcolab-migrate" ''
        /var/lib/catcolab/infrastructure/scripts/migrate.sh
    '';

    buildScript = pkgs.writeShellScriptBin "catcolab-build" ''
        /var/lib/catcolab/infrastructure/scripts/build.sh
    '';

    packages = with pkgs; [
        rustup
        nodejs
        nodejs.pkgs.pnpm
        git
        stdenv.cc
        openssl.dev
        pkg-config
    ];

    scripts = [
        initScript
        stopScript
        startScript
        restartScript
        statusScript
        migrateScript
        buildScript
    ];

in {
    age.secrets.".env" = {
        file = "${inputs.self}/secrets/.env.age";
        mode = "400";
        owner = "catcolab";
    };

    services.postgresql.enable = true;

    services.nginx.enable = true;

    services.nginx.virtualHosts."automerge-next.catcolab.org" = {
        forceSSL = true;
        enableACME = true;
        locations."/" = {
            extraConfig = ''
              if ($request_method = OPTIONS) {
                return 204;
              }
              proxy_hide_header 'Access-Control-Allow-Origin';
              add_header 'Access-Control-Allow-Origin' '*' always;
              add_header 'Access-Control-Allow-Methods' 'GET, POST, DELETE, PUT, OPTIONS' always;
              add_header 'Access-Control-Allow-Headers' 'DNT,User-Agent,X-Requested-With,If-Modified-Since,Cache-Control,Content-Type,Range,Authorization' always;
              proxy_pass http://localhost:${automergePort};
              error_log syslog:server=unix:/dev/log;
              access_log syslog:server=unix:/dev/log;
              proxy_http_version 1.1;
              proxy_set_header Upgrade $http_upgrade;
              proxy_set_header Connection "upgrade";
            '';
        };
      };

      services.nginx.virtualHosts."backend-next.catcolab.org" = {
        forceSSL = true;
        enableACME = true;
        locations."/" = {
          extraConfig = ''
              if ($request_method = OPTIONS) {
                return 204;
              }
              proxy_hide_header 'Access-Control-Allow-Origin';
              add_header 'Access-Control-Allow-Origin' '*' always;
              add_header 'Access-Control-Allow-Methods' 'GET, POST, DELETE, PUT, OPTIONS' always;
              add_header 'Access-Control-Allow-Headers' 'DNT,User-Agent,X-Requested-With,If-Modified-Since,Cache-Control,Content-Type,Range,Authorization' always;
              proxy_pass http://localhost:${backendPort};
              error_log syslog:server=unix:/dev/log;
              access_log syslog:server=unix:/dev/log;
              proxy_http_version 1.1;
              proxy_set_header Upgrade $http_upgrade;
              proxy_set_header Connection "upgrade";
          '';
        };
      };

    systemd.services.automerge = {
        enable = true;
        wantedBy = ["multi-user.target"];

        environment = {
            PORT = automergePort;
        };

        serviceConfig = {
            User = "catcolab";
            ExecStart = automergeScript;
            Type = "simple";
            WorkingDirectory = "/var/lib/catcolab/packages/automerge-doc-server/";
            Restart = "on-failure";
        };
    };

    systemd.services.backend = {
        enable = true;
        wantedBy = ["multi-user.target"];

        environment = {
            PORT = backendPort;
        };

        serviceConfig = {
            User = "catcolab";
            ExecStart = backendScript;
            Type = "simple";
            WorkingDirectory = "/var/lib/catcolab/packages/backend/";
            Restart = "on-failure";
        };
    };

    security.sudo.extraRules = [{
        users = [ "catcolab" ]; 
        commands = [
            { command = "/run/current-system/sw/bin/systemctl start automerge"; options = [ "NOPASSWD" ]; } 
            { command = "/run/current-system/sw/bin/systemctl stop automerge"; options = [ "NOPASSWD" ]; } 
            { command = "/run/current-system/sw/bin/systemctl restart automerge"; options = [ "NOPASSWD" ]; }
            { command = "/run/current-system/sw/bin/systemctl start backend"; options = [ "NOPASSWD" ]; } 
            { command = "/run/current-system/sw/bin/systemctl stop backend"; options = [ "NOPASSWD" ]; } 
            { command = "/run/current-system/sw/bin/systemctl restart backend"; options = [ "NOPASSWD" ]; }
        ]; 
    }];

    environment.systemPackages = packages ++ scripts;

    environment.variables.PKG_CONFIG_PATH = "/run/current-system/sw/lib/pkgconfig";
}
