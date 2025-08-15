{
  lib,
  config,
  modulesPath,
  ...
}:
{
  imports = [
    ../../modules/catcolab
    "${modulesPath}/virtualisation/qemu-vm.nix"
  ];

  users.users.catcolab = {
    initialPassword = "catcolab";
  };

  environment.etc."catcolab/catcolab-secrets.env" = {
    source = ../../secrets/example-secrets.env;
    mode = "0400";
    user = "catcolab";
    group = "catcolab";
  };

  catcolab = {
    enable = true;
    backend = {
      port = 8000;
      hostname = "backend-next.catcolab.org";
    };
    automerge = {
      port = 8010;
      hostname = "automerge-next.catcolab.org";
    };
    environmentFilePath = /etc/catcolab/catcolab-secrets.env;
    host = {
      enable = true;
    };
  };

  virtualisation.forwardPorts = [
    {
      from = "host";
      host.port = config.catcolab.backend.port;
      guest.port = config.catcolab.backend.port;
    }
    {
      from = "host";
      host.port = config.catcolab.automerge.port;
      guest.port = config.catcolab.automerge.port;
    }
    {
      from = "host";
      host.port = 5433;
      guest.port = 5432;
    }
  ];

  services.postgresql.settings.listen_addresses = lib.mkForce "*";
  services.postgresql.authentication = ''
    # Local IPv4 loopback
    host  all  all  127.0.0.1/32  md5
    # QEMU host as seen from the guest
    host  all  all  10.0.2.2/32   md5
    # (optional) IPv6 localhost if you use it
    host  all  all  ::1/128       md5
  '';

  networking.firewall.allowedTCPPorts = [
    config.catcolab.backend.port
    config.catcolab.automerge.port
    5432
  ];

  networking.hostName = "catcolab";
  time.timeZone = "America/New_York";
  system.stateVersion = "24.05";
}
