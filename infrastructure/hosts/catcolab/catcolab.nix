{ inputs, pkgs, config, ... }:

let
    port = "8000";
in {
    age.secrets.DATABASE_URL = {
        file = "${inputs.self}/secrets/DATABASE_URL.age";
        mode = "400";
        owner = "catcolab";
    };

    services.postgresql.enable = true;
    services.nginx.enable = true;

    services.nginx.virtualHosts."next.catcolab.org" = {
        # forceSSL = true;
        # enableACME = true;
        root = "/var/lib/catcolab/packages/frontend/dist";
        locations."/" = {
            tryFiles = "$uri /index.html";
        };
        locations."/api" = {
            extraConfig = ''
                error_log syslog:server=unix:/dev/log;
                access_log syslog:server=unix:/dev/log;
                rewrite ^/api/(.*) /$1 break;
                proxy_http_version 1.1;
                proxy_set_header Upgrade $http_upgrade;
                proxy_set_header Connection "upgrade";
                proxy_pass http://localhost:${port};
            '';
        };
    };

    systemd.services.catcolab = {
        enable = true;
        wantedBy = ["multi-user.target"];

        environment = {
            PORT = port;
            DATABASE_URL_PATH = config.age.secrets.DATABASE_URL.path;
        };

        serviceConfig = {
            User = "catcolab";
            ExecStart = "${pkgs.nodejs}/bin/node dist/index.js";
            Type="simple";
            WorkingDirectory = "/var/lib/catcolab/packages/backend/";
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
