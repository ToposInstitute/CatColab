args@{
  modulesPath,
  config,
  rustToolchain,
  pkgs,
  ...
}:
{
  imports = [
    ../../modules/catcolab.nix
    ../../modules/catcolab-host.nix
    "${modulesPath}/virtualisation/qemu-vm.nix"
  ];

  catcolabHost = { };
  users.users.catcolab = {
    initialPassword = "test";
  };

  # environment.systemPackages = with pkgs; [
  #   nodePackages.firebase-tools
  # ];

  environment.etc."catcolab/catcolab-secrets.env" = {
    source = ../../secrets/example-secrets.env;
    mode = "0400";
    user = "catcolab";
    group = "catcolab";
  };

  catcolab = {
    backendPort = 8000;
    automergePort = 8010;
    backendHostname = "backend-next.catcolab.org";
    automergeHostname = "automerge-next.catcolab.org";
    environmentFilePath = /etc/catcolab/catcolab-secrets.env;
  };

  virtualisation.forwardPorts = [
    {
      from = "host";
      host.port = config.catcolab.backendPort;
      guest.port = config.catcolab.backendPort;
    }
    {
      from = "host";
      host.port = config.catcolab.automergePort;
      guest.port = config.catcolab.automergePort;
    }
  ];

  networking.useDHCP = true;

  networking.firewall.allowedTCPPorts = [
    config.catcolab.backendPort
    config.catcolab.automergePort
  ];

  networking.hostName = "catcolab-vm";
  time.timeZone = "America/New_York";
  system.stateVersion = "24.05";
}
