# NixOS test for running frontend tests against the catcolab VM
# Run with: nix build .#checks.x86_64-linux.frontendTests
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
    catcolab_vm = { pkgs, ... }: {
      imports = [ ../hosts/catcolab-vm ];

      # Add nodejs and npm to the VM environment
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

    def test_service(machine, service):
        try:
            machine.wait_for_unit(service)
        except:
            dump_logs(machine, service)
            raise

    # Start the machine
    catcolab_vm.start()

    # Wait for essential services to be ready
    print("Waiting for services to start...")
    test_service(catcolab_vm, "automerge.service")
    test_service(catcolab_vm, "backend.service")

    # Wait for backend to be responsive
    print("Waiting for backend to be responsive...")
    catcolab_vm.wait_until_succeeds(
        "curl -s http://localhost:8000/status | grep -q Running",
        timeout=60
    )

    print("Backend is ready, running frontend tests...")

    # Run the frontend tests inside the VM
    # The tests will connect to http://localhost:8000
    catcolab_vm.succeed(
        "${self.packages.x86_64-linux.frontend-tests}/bin/frontend-tests"
    )

    print("Frontend tests completed successfully!")
  '';
}
