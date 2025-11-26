{
  nixpkgs,
  inputs,
  self,
  rustToolchain,
  linuxSystem,
}:
nixpkgs.legacyPackages.${linuxSystem}.testers.runNixOSTest {
  name = "Frontend Tests";

  skipTypeCheck = true;

  nodes = {
    catcolab_vm =
      { pkgs, ... }:
      {
        imports = [ ../hosts/catcolab-vm ];

        environment.systemPackages = with pkgs; [
          nodejs_24
          curl
        ];
      };
  };

  node.specialArgs = {
    inherit inputs self rustToolchain;
  };

  testScript = ''
    def dump_logs(machine, *units):
        for u in units:
            print(f"\n===== journal for {u} =====")
            print(machine.succeed(f"journalctl -u {u} --no-pager"))

    catcolab_vm.start()

    status, test_output = catcolab_vm.execute(
        # redirect stderr to stdout, otherwise error messages won't be included in test_output
        "${self.packages.x86_64-linux.frontend-tests}/bin/frontend-tests 2>&1"
    )

    dump_logs(catcolab_vm, "automerge.service")
    dump_logs(catcolab_vm, "backend.service")

    print("\n===== frontend tests output =====")
    print(test_output)

    if status != 0:
        raise Exception(f"Frontend tests failed with exit code {status}")
  '';
}
