#!/usr/bin/env bash

set -euo pipefail

# SSH options for connecting to the VM
# These options skip host key verification for the local development VM
VM_SSH_OPTS="-p 2221 -o UserKnownHostsFile=/dev/null -o StrictHostKeyChecking=no"

# VM subcommand functions

function print_vm_help {
  echo "Usage: $0 vm <subcommand> [options]"
  echo ""
  echo "Subcommands:"
  echo "  start [--skip-db]     Start the VM in background (with staging data by default)"
  echo "  stop                  Stop the running VM"
  echo "  status                Show VM status"
  echo "  connect               Connect to the VM via SSH"
  echo "  test-deploy           Build VM from staging, load data, test deploy"
  echo "  logs [--follow]       Show VM logs (use -f or --follow to tail)"
  echo ""
  echo "Use '$0 vm <subcommand> --help' for more information."
}

function run_vm() {
  local subcommand="${1-}"
  shift || true

  case "$subcommand" in
    start)
      run_vm_start "$@"
      ;;
    stop)
      run_vm_stop "$@"
      ;;
    status)
      run_vm_status "$@"
      ;;
    logs)
      run_vm_logs "$@"
      ;;
    connect)
      run_vm_connect "$@"
      ;;
    test-deploy)
      run_vm_test_deploy "$@"
      ;;
    "-h" | "--help" | "")
      print_vm_help
      ;;
    *)
      echo "Unknown vm subcommand: $subcommand"
      echo ""
      print_vm_help
      exit 1
      ;;
  esac
}


function run_vm_stop() {
  if ! vm_is_running; then
    echo "VM is not running"
    exit 1
  fi

  local monitor_socket="$(get_vm_monitor_socket)"

  echo "Stopping VM..."
  # Send graceful shutdown via QEMU monitor
  if [[ -S "$monitor_socket" ]]; then
    echo "Sending ACPI power button event..."
    echo "system_powerdown" | socat - "UNIX-CONNECT:$monitor_socket" 2>/dev/null || true

    if wait_for_vm_shutdown 30; then
      echo "VM stopped"
      rm -f "$monitor_socket"
      return 0
    fi

    echo "Error: VM did not shut down within timeout"
    echo "Check logs: $(get_vm_log_file)"
    exit 1
  else
    echo "Error: Monitor socket not found"
    exit 1
  fi
}

function run_vm_status() {
  if vm_is_running; then
    echo "VM is running"
    echo "Logs: $(get_vm_log_file)"
  else
    echo "VM is not running"
    exit 1
  fi
}

function run_vm_logs() {
  local log_file="$(get_vm_log_file)"
  local follow=false

  while [[ ${1-} ]]; do
    case "$1" in
      "-f"|"--follow")
        follow=true
        ;;
      *)
        echo "Unknown argument: $1"
        exit 1
        ;;
    esac
    shift
  done

  if [[ ! -f "$log_file" ]]; then
    echo "No log file found at $log_file"
    exit 1
  fi

  if [[ "$follow" == "true" ]]; then
    tail -f "$log_file"
  else
    cat "$log_file"
  fi
}

function run_vm_connect() {
  if ! vm_is_running; then
    echo "VM is not running. Start it first with: $0 vm start"
    exit 1
  fi

  echo "Connecting to VM via SSH..."

  if ! ssh $VM_SSH_OPTS catcolab@localhost; then
    echo ""
    echo "Note: If authentication failed, your SSH public key must be added to"
    echo "      'env.next.age' in infrastructure/secrets/secrets.nix"
    exit 1
  fi
}

function load_staging_db_to_vm() {
  echo "Dumping staging database..."
  local dump_file=$(run_dump --from staging --quiet)
  if [[ ! -f "$dump_file" ]]; then
    echo "Error: Failed to create staging dump"
    return 1
  fi

  echo "Stopping backend service..."
  ssh $VM_SSH_OPTS catcolab@localhost "sudo systemctl stop backend"

  echo "Loading staging database into VM..."
  if ! run_load --to vm --from "$dump_file" --skip-migrations; then
    echo "Error: Failed to load database"
    return 1
  fi

  echo "Starting backend service (migrations will run on loaded data)..."
  ssh $VM_SSH_OPTS catcolab@localhost "sudo systemctl start backend"
  if ! wait_for_backend 60; then
    echo "Error: Timeout waiting for backend service to restart"
    return 1
  fi

  echo "Backend ready"
  return 0
}

function run_vm_start() {
  local skip_db=false

  # Parse arguments
  while [[ ${1-} ]]; do
    case "$1" in
      "--skip-db")
        skip_db=true
        ;;
      "-h"|"--help")
        echo "Usage: $0 vm start [options]"
        echo ""
        echo "Options:"
        echo "  --skip-db    Skip loading staging database"
        echo "  -h, --help   Show this help message"
        exit 0
        ;;
      *)
        echo "Unknown argument: $1"
        echo "Use '$0 vm start --help' for more information."
        exit 1
        ;;
    esac
    shift
  done

  if vm_is_running; then
    echo "VM is already running"
    exit 1
  fi

  local monitor_socket="$(get_vm_monitor_socket)"
  local log_file="$(get_vm_log_file)"

  # Start the nix VM in background with a monitor socket
  # We pass additional QEMU args via -- to add monitor socket support
  nix run .#nixosConfigurations.catcolab-vm.config.system.build.vm -- \
    -nographic \
    -monitor "unix:$monitor_socket,server,nowait" \
    >> "$log_file" 2>&1 &

   
  echo "Logs: cc-utils vm logs"

  echo "Waiting for VM to start..."
  if ! wait_for_backend 60; then
    echo "Error: Timeout waiting for VM to be available"
    echo "Logs: cc-utils vm logs"
    exit 1
  fi

  if [[ "$skip_db" == "false" ]]; then
    echo "Loading staging database..."
    if ! load_staging_db_to_vm; then
      echo "Error: Failed to load staging database"
      exit 1
    fi
  fi

  print_vm_ready
}

function run_vm_test_deploy() {
  if vm_is_running; then
    echo "Error: VM is already running"
    echo "Please stop it first with: cc-utils vm stop"
    exit 1
  fi

  echo "Building VM from frontend-tests-ci branch..."
  if ! nix build github:ToposInstitute/CatColab/frontend-tests-ci#catcolab-vm; then
    echo "Error: Failed to build VM from frontend-tests-ci branch"
    exit 1
  fi

  echo "Copying VM image to working directory..."
  local vm_disk="./catcolab-vm.qcow2"
  if [[ ! -f "result/catcolab-vm.qcow2" ]]; then
    echo "Error: Built VM image not found at result/catcolab-vm.qcow2"
    exit 1
  fi
  cp "result/$vm_disk" "$vm_disk"

  echo "Starting VM with QEMU..."
  local monitor_socket="$(get_vm_monitor_socket)"
  local log_file="$(get_vm_log_file)"

  # Start QEMU vm in background
  qemu-system-x86_64 \
    -enable-kvm -cpu host -smp 2 -m 2048 \
    -nographic \
    -drive file="$vm_disk",if=virtio,format=qcow2 \
    -device virtio-net-pci,netdev=net0 \
    -netdev user,id=net0,hostfwd=tcp::2221-:22,hostfwd=tcp::5433-:5432,hostfwd=tcp::8000-:8000,hostfwd=tcp::8010-:8010 \
    -monitor "unix:$monitor_socket,server,nowait" \
    >> "$log_file" 2>&1 &

  echo "Logs: cc-utils vm logs"

  echo "Waiting for VM to start..."
  if ! wait_for_backend 60; then
    echo "Error: Timeout waiting for VM to be available"
    echo "Check logs: $log_file"
    exit 1
  fi

  echo "Loading staging database..."
  if ! load_staging_db_to_vm; then
    echo "Error: Failed to load staging database"
    exit 1
  fi

  echo "Deploying local changes to VM..."
  if ! deploy -s --ssh-opts="$VM_SSH_OPTS" .#catcolab-vm; then
    echo "Error: Deployment failed"
    exit 1
  fi

  print_vm_ready "Test deployment complete!"
}
