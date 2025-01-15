{ inputs, pkgs, config, ... }:

let
    automergePort = "8010";
    backendPort = "8000";

    automergeScript = pkgs.writeShellScript "automerge.sh" ''
        ln -sf ${config.age.secrets."instrument.mjs".path} /var/lib/catcolab/packages/backend/
        ${pkgs.nodejs}/bin/node dist/automerge-doc-server/src/main.js
    '';

    backendScript = pkgs.writeShellScript "backend.sh" ''
        ln -sf ${config.age.secrets.".env".path} /var/lib/catcolab/packages/backend/
        ../../target/debug/backend
    '';

    initScript = pkgs.writeShellScriptBin "catcolab-init.sh" ''
        # clone catcolab repo
        cd /var/lib
        git clone https://github.com/ToposInstitute/CatColab.git
        mv CatColab catcolab
        chown -R catcolab:catcolab catcolab
        cd catcolab

        # install node dependencies
        su -m catcolab -c "cd /var/lib/catcolab/packages/backend; pnpm install"

        # install rust and cargo
        su -m catcolab -c "cd /var/lib/catcolab/packages/backend; rustup default stable"
        
        # install sqlx-cli for migrations
        su -m catcolab -c "cd /var/lib/catcolab/packages/backend; cargo install sqlx-cli"

        # set up postgres user, database, permissions
        su -m postgres -- /var/lib/catcolab/infrastructure/scripts/initdb.sh $(cat ${config.age.secrets.".env".path})

        # stop automerge, build services if running
        /var/lib/catcolab/infrastructure/scripts/stop.sh

        # migrate
        su -m catcolab -- /var/lib/catcolab/infrastructure/scripts/migrate.sh

        # build binaries
        su -m catcolab -- /var/lib/catcolab/infrastructure/scripts/build.sh

        # start automerge, build services
        /var/lib/catcolab/infrastructure/scripts/start.sh
    '';

    stopScript = pkgs.writeShellScriptBin "catcolab-stop.sh" ''
        /var/lib/catcolab/infrastructure/scripts/stop.sh
    '';

    startScript = pkgs.writeShellScriptBin "catcolab-start.sh" ''
        /var/lib/catcolab/infrastructure/scripts/start.sh
    '';

    migrateScript = pkgs.writeShellScriptBin "catcolab-migrate.sh" ''
        su -m catcolab -- /var/lib/catcolab/infrastructure/scripts/migrate.sh
    '';

    buildScript = pkgs.writeShellScriptBin "catcolab-build.sh" ''
        su -m catcolab -- /var/lib/catcolab/infrastructure/scripts/build.sh
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
        migrateScript
        buildScript
    ];

in {
    age.secrets.".env" = {
        file = "${inputs.self}/secrets/.env.age";
        mode = "400";
        owner = "catcolab";
    };

    age.secrets."instrument.mjs" = {
        file = "${inputs.self}/secrets/instrument.mjs.age";
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
            NODE_OPTIONS = "--import ./instrument.mjs";
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
            Type="simple";
            WorkingDirectory = "/var/lib/catcolab/packages/backend/";
            Restart = "on-failure";
        };
    };

    users.users.catcolab = {
        isNormalUser = true;
        group = "catcolab";
    };

    users.groups.catcolab = {};

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
