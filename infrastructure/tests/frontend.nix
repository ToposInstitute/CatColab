{
  nixpkgs,
  inputs,
  self,
  rustToolchain,
  linuxSystem,
}:
let
  pkgs = nixpkgs.legacyPackages.${linuxSystem};
  frontendTests = self.packages.${linuxSystem}.frontend-tests;
  parallelTests = pkgs.writeShellScript "frontend-parallel-tests" ''
    set -euo pipefail
    umask 077
    results=/tmp/frontend-test-results
    mkdir -p "$results"
    chown catcolab:catcolab "$results"

    run_test() {
      name=$1
      shift
      status=0
      ${pkgs.util-linux}/bin/runuser -u catcolab -- \
        ${pkgs.coreutils}/bin/timeout --signal=TERM --kill-after=30s 180s \
        "$@" > "$results/$name.log" 2>&1 || status=$?
      printf '%s\n' "$status" > "$results/$name.status"
    }

    run_test frontend ${frontendTests}/bin/frontend-tests &
    run_test logged_out ${frontendTests}/bin/frontend-bombadil-logged-out \
      --output-path "$results/logged_out.bin" &
    run_test logged_in ${frontendTests}/bin/frontend-bombadil-logged-in \
      --output-path "$results/logged_in.bin" &
    wait
  '';
in
pkgs.testers.runNixOSTest {
  name = "Frontend Tests";

  skipTypeCheck = true;

  nodes = {
    catcolab_vm =
      { pkgs, ... }:
      {
        imports = [ ../hosts/catcolab-vm ];

        virtualisation.memorySize = 8192;
        virtualisation.cores = 4;

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
    try:
        catcolab_vm.wait_for_unit("backend.service")
        catcolab_vm.wait_for_open_port(8000)
        catcolab_vm.wait_until_succeeds("curl --fail --silent http://127.0.0.1:8000/ > /dev/null")
        for path in ["/help/credits", "/help/credits/", "/documents"]:
            catcolab_vm.succeed(f"curl --fail --silent -H 'Accept: text/html' http://127.0.0.1:8000{path} | grep -q '<!doctype html>'")
        for path, expected in [("/assets/missing.js", "404"), ("/rpc/missing", "400")]:
            code = catcolab_vm.succeed(f"curl --silent -o /dev/null -w '%{{http_code}}' -H 'Accept: text/html' http://127.0.0.1:8000{path}")
            assert code == expected, f"{path}: expected {expected}, got {code}"
        status, test_output = catcolab_vm.execute("${parallelTests} 2>&1", timeout=240)
        print(test_output)
        failures = []
        for name in ["frontend", "logged_out", "logged_in"]:
            print(f"\n===== {name} output =====")
            _, output = catcolab_vm.execute(f"cat /tmp/frontend-test-results/{name}.log 2>&1")
            print(output)
            read_status, code = catcolab_vm.execute(f"cat /tmp/frontend-test-results/{name}.status 2>&1")
            if read_status != 0:
                failures.append(f"{name}: missing exit status")
            elif code.strip() != "0":
                failures.append(f"{name}: exit {code.strip()}")
        if status != 0:
            failures.append(f"parallel runner: exit {status}")
        if failures:
            raise Exception("Frontend tests failed: " + ", ".join(failures))
    finally:
        dump_logs(catcolab_vm, "automerge.service", "backend.service")
        if catcolab_vm.execute("test -d /tmp/frontend-test-results")[0] == 0:
            catcolab_vm.copy_from_vm("/tmp/frontend-test-results", "frontend-test-results")
  '';
}
