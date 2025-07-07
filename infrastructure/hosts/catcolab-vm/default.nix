{
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
      backup = {
        enable = true;
        test = true;
      };
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
  ];

  networking.firewall.allowedTCPPorts = [
    config.catcolab.backend.port
    config.catcolab.automerge.port
  ];

  networking.hostName = "catcolab";
  time.timeZone = "America/New_York";
  system.stateVersion = "24.05";
}
