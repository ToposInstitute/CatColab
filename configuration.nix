{
  config,
  pkgs,
  modulesPath,
  ...
}:

{

  imports = [

    # "${modulesPath}/virtualisation/qemu.nix"
  ];

  boot.loader.systemd-boot.enable = true;

  boot.loader.efi.canTouchEfiVariables = true;

  system.stateVersion = "24.05";

  users.users.alice = {

    isNormalUser = true;

    initialPassword = "test";
    extraGroups = [ "wheel" ];

  };

  # imports = [ "${modulesPath}/virtualisation/qemu-vm.nix" ];
  # virtualisation.qemu.package = pkgs.qemu_kvm;
  # virtualisation.qemu.memorySize = 2048; # MiB
  # virtualisation.qemu.cpus = 2;
  # virtualisation.qemu.disks = [
  #   {
  #     file = ./my-vm.qcow2;
  #     size = 10 * 1024 * 1024 * 1024;
  #   }
  # ];
  # virtualisation.qemu.network = "user";
  # networking.firewall.enable = false;
  # services.openssh.enable = true;
  users.users.root.initialPassword = "root";
  environment.systemPackages = with pkgs; [
    vim
    cowsay
    git
    htop
  ];
}
