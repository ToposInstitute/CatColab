# The backend relies on Firebase, so tests require VM internet access. Enable networking by running
# with --no-sandbox.
# Docs for nixos tests: https://nixos.org/manual/nixos/stable/index.html#sec-nixos-test-nodes
# (google and LLMs are useless)
{
  nixpkgs,
  inputs,
  self,
  rustToolchain,
  linuxSystem,
}:
nixpkgs.legacyPackages.${linuxSystem}.testers.runNixOSTest {
  name = "Integration Tests";

  skipTypeCheck = true;

  nodes = {
    catcolab = import ../hosts/catcolab-vm;
  };

  node.specialArgs = {
    inherit inputs self rustToolchain;
  };

  # NOTE: This only checks if the services "start" from systemds perspective, not if they are not
  # failed immediately after starting...
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

    def test_oneshot_service(machine, service):
        try:
            machine.wait_until_succeeds(
                f"test $(systemctl is-active {service}) = inactive"
            )
        except:
            dump_logs(machine, service)
            raise

    test_oneshot_service(catcolab, "database-setup.service")
    test_oneshot_service(catcolab, "migrations.service")

    test_service(catcolab, "automerge.service");
    test_service(catcolab, "backend.service");
    test_service(catcolab, "caddy.service");

    catcolab.start_job("backupdb.service")
    test_oneshot_service(catcolab, "backupdb.service")
  '';
}
