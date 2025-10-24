# Frontend tests that run against a backend server
# Uses Firebase Auth emulator for authentication, allowing tests to run in sandbox
# Docs for nixos tests: https://nixos.org/manual/nixos/stable/index.html#sec-nixos-test-nodes
{
  nixpkgs,
  inputs,
  self,
  rustToolchain,
  linuxSystem,
}:
nixpkgs.legacyPackages.${linuxSystem}.testers.runNixOSTest {
  name = "Frontend Tests with Backend";

  skipTypeCheck = true;

  nodes = {
    catcolab_vm =
      { pkgs, ... }:
      {
        imports = [ ../hosts/catcolab-vm ];
        _module.args = {
          inherit inputs self rustToolchain;
        };

        services.caddy.enable = false;
      };

    client =
      { pkgs, ... }:
      {
        environment.systemPackages = [
          self.packages.${linuxSystem}.frontend-tests
          pkgs.curl
          pkgs.nodejs_24
        ];
      };
  };

  testScript = ''
    start_all()

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

    def test_oneshot_service(machine, service):
        try:
            machine.wait_until_succeeds(
                f"test $(systemctl is-active {service}) = inactive"
            )
        except:
            dump_logs(machine, service)
            raise

    # Wait for server services to be ready
    test_oneshot_service(catcolab_vm, "database-setup.service")
    test_service(catcolab_vm, "automerge.service")
    test_service(catcolab_vm, "backend.service")

    # Wait for backend HTTP endpoint to be ready
    catcolab_vm.wait_until_succeeds(
        "curl -f http://localhost:8000/status",
        timeout=60
    )

    # Get the server's IP address
    server_ip = catcolab_vm.succeed("ip addr show eth1 | grep -oP '(?<=inet\\s)\\d+(\\.\\d+){3}'").strip()
    print(f"Server IP: {server_ip}")

    # Wait for client to be ready
    client.wait_for_unit("multi-user.target")

    # Wait for server to be reachable from client
    client.wait_until_succeeds(
        f"curl -f http://{server_ip}:8000/status",
        timeout=30
    )

    # Dump server logs before running client tests
    print("\n===== Server status before client tests =====")
    print(catcolab_vm.succeed("curl http://localhost:8000/status"))
    dump_logs(catcolab_vm, "database-setup.service", "automerge.service", "backend.service")

    # Run the frontend tests pointing to the server
    # The tests read from .env.development which uses 127.0.0.1, so we need to override
    # print("\n===== Running frontend tests =====")
    # status, output = client.execute(
    #     f"VITE_SERVER_URL=http://{server_ip}:8000 "
    #     f"VITE_AUTOMERGE_REPO_URL=ws://{server_ip}:8010 "
    #     "frontend-tests"
    # )
    # print(output)
    # if status != 0:
    #     raise Exception(f"Frontend tests failed with status {status}")
  '';
}
