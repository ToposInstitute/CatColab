{ inputs, pkgs, config, ... }:

let
    port = "8000";
in {
    age.secrets.DATABASE_URL = {
        file = "${inputs.self}/secrets/DATABASE_URL.age";
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

    services.nginx.virtualHosts."backend-next.catcolab.org" = {
        forceSSL = true;
        enableACME = true;
        locations."/" = {
            extraConfig = ''
                if ($request_method = OPTIONS) {
                    return 204;
                }
                add_header 'Access-Control-Allow-Origin' '*' always;
                add_header 'Access-Control-Allow-Methods' 'GET, POST, DELETE, PUT, OPTIONS' always;
                add_header 'Access-Control-Allow-Headers' 'DNT,User-Agent,X-Requested-With,If-Modified-Since,Cache-Control,Content-Type,Range,Authorization' always;
                proxy_pass http://localhost:${port};
                error_log syslog:server=unix:/dev/log;
                access_log syslog:server=unix:/dev/log;
                proxy_http_version 1.1;
                proxy_set_header Upgrade $http_upgrade;
                proxy_set_header Connection "upgrade";
            '';
        };
    };

    systemd.services.catcolab = {
        enable = true;
        wantedBy = ["multi-user.target"];

        environment = {
            PORT = port;
            DATABASE_URL_PATH = config.age.secrets.DATABASE_URL.path;
            NODE_OPTIONS = "--import ${config.age.secrets."instrument.mjs".path}";
        };

        serviceConfig = {
            User = "catcolab";
            ExecStart = "${pkgs.nodejs}/bin/node dist/index.js";
            Type="simple";
            WorkingDirectory = "/var/lib/catcolab/packages/backend/";
            Restart = "on-failure";
        };
    };

    users.users.catcolab = {
        isNormalUser = true;
        group = "catcolab";
    };

    environment.systemPackages = with pkgs; [
        rustup
        nodejs
        git
        stdenv.cc
    ];

    environment.variables.DATABASE_URL_PATH = config.age.secrets.DATABASE_URL.path;

    users.groups.catcolab = {};
}
