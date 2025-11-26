#!/usr/bin/env bash

set -euo pipefail

function confirm_action() {
  local message="$1"
  echo "$message"
  read -n1 -r -p "Continue? [y/N] " yn
  echo  # newline after prompt
  if [[ $yn != [yY] ]]; then
    echo "Aborted."
    return 1
  fi
  return 0
}

function load_env() {
  local varname="$1"
  local env_file="$2"

  if [[ -z $varname || -z $env_file ]]; then
    echo "Usage: load_env VAR ENV_FILE" >&2
    exit 1
  fi

  if [[ ! -f $env_file ]]; then
    echo "Error: '$env_file' not found." >&2
    exit 1
  fi

  # Decrypt if it's an agenix file
  local content
  if [[ $env_file == *.age ]]; then
    pushd "$(dirname "$env_file")" >/dev/null
    content=$(agenix -d "$(basename "$env_file")")
    popd >/dev/null
  else
    content=$(<"$env_file")
  fi

  # get the contents of the varname variable
  local url=$(printf '%s\n' "$content" | grep -E "^${varname}=" | cut -d '=' -f2-)
  if [[ -z $url ]]; then
    echo "Error: '$varname' missing in $env_file." >&2
    exit 1
  fi

  # strip off protocol if it exists
  url="${url#postgresql://}"
  url="${url#postgres://}"

  # split into components
  IFS=':@/' read -r PGUSER PGPASSWORD PGHOST PGPORT PGDATABASE <<< "$url"
  export PGUSER PGPASSWORD PGHOST PGPORT PGDATABASE
}

function open_tunnel() {
  local user="$1" host="$2" local_port="$3" remote_port="$4" pid_var="$5"

  # only open once
  if [[ -z "${!pid_var-}" ]]; then
    ssh -N -L "${local_port}:localhost:${remote_port}" "${user}@${host}" &
    # stash its PID in the named variable
    eval "$pid_var=$!"
    # ensure cleanup on exit
    trap "kill ${!pid_var} 2>/dev/null || true" EXIT

    wait_for_port localhost "$local_port" || {
      echo "Failed to open tunnel to $host:$remote_port" >&2
      exit 1
    }
  fi
}

function wait_for_port() {
  local host=$1 port=$2 timeout=${3:-5}
  local elapsed=0

  while ! nc -z "$host" "$port" 2>/dev/null; do
    if (( elapsed >= timeout * 10 )); then
      echo "Timeout waiting for $host:$port" >&2
      return 1
    fi
    sleep 0.1
    (( elapsed++ ))
  done
}

function load_target_env() {
  case "$1" in
    local_superuser)
      local env_file="$(find_git_root)/packages/backend/.env"

      if grep -q "^DATABASE_SUPERUSER_URL=" "$env_file" 2>/dev/null; then
        load_env DATABASE_SUPERUSER_URL "$env_file"
      else
        # Fall back to constructing from DATABASE_URL + prompted password
        echo "Tip: Add 'DATABASE_SUPERUSER_URL=postgresql://postgres:<password>@localhost:5432/postgres' to $env_file to configure postgres superuser access" >&2
        echo "" >&2

        load_env DATABASE_URL "$env_file"
        local db_host="$PGHOST"
        local db_port="$PGPORT"

        read -s -p "Enter postgres user password: " pg_password
        echo ""

        export PGUSER="postgres"
        export PGPASSWORD="$pg_password"
        export PGHOST="$db_host"
        export PGPORT="$db_port"
        export PGDATABASE="postgres"
      fi
      ;;
    local)
      load_env DATABASE_URL "$(find_git_root)/packages/backend/.env"
      ;;
    vm)
      load_env DATABASE_URL "$(find_git_root)/infrastructure/secrets/example-secrets.env"
      export PGPORT="5433"
      ;;
    staging)
      load_env DATABASE_URL "$(find_git_root)/infrastructure/secrets/env.next.age"

      open_tunnel "catcolab" "backend-next.catcolab.org" "$STAGING_LOCAL_PGPORT" "$PGPORT" "STAGING_SSH_PID"

      export PGPORT="$STAGING_LOCAL_PGPORT"
      ;;
    production)
      load_env DATABASE_URL "$(find_git_root)/infrastructure/secrets/env.prod.age"

      open_tunnel "catcolab" "backend.catcolab.org" "$PROD_LOCAL_PGPORT" "$PGPORT" "PROD_SSH_PID"

      export PGPORT="$PROD_LOCAL_PGPORT"
      ;;
    *)
      echo "Unknown target: $1" >&2
      print_help
      exit 1
      ;;
  esac
}

function find_git_root() {
  local dir="$PWD"
  while [[ $dir != "/" ]]; do
    if [[ -d "$dir/.git" ]]; then
      echo "$dir"
      return
    fi
    dir=$(dirname "$dir")
  done
  return 1
}

function run_local_migrations() {
  echo "Running local migrations..."
  cargo run -p migrator apply
}

# VM management functions
function get_vm_cache_dir() {
  local cache_dir
  if [[ -n "${XDG_CACHE_HOME:-}" ]]; then
    cache_dir="$XDG_CACHE_HOME/catcolab"
  elif [[ "$(uname)" == "Darwin" ]]; then
    cache_dir="$HOME/Library/Caches/catcolab"
  else
    cache_dir="$HOME/.cache/catcolab"
  fi
  mkdir -p "$cache_dir"
  echo "$cache_dir"
}

function get_vm_log_file() {
  echo "$(get_vm_cache_dir)/vm.log"
}

function get_vm_monitor_socket() {
  echo "$(get_vm_cache_dir)/vm-monitor.sock"
}

function vm_is_running() {
  local monitor_socket="$(get_vm_monitor_socket)"

  # Check if socket exists and is connectable
  if [[ -S "$monitor_socket" ]]; then
    # Try to connect to verify it's active (without sending a command)
    if echo | socat -T 1 - "UNIX-CONNECT:$monitor_socket" >/dev/null 2>&1; then
      return 0
    fi
  fi

  # Stale socket file
  rm -f "$monitor_socket"
  return 1
}

function wait_for_vm_shutdown() {
  local timeout="${1:-30}"
  local elapsed=0

  while vm_is_running; do
    if (( elapsed >= timeout )); then
      return 1
    fi
    sleep 1
    (( elapsed++ ))
  done

  return 0
}

function wait_for_backend() {
  local timeout="${1:-60}"
  local backend_url="http://localhost:8000/status"
  local elapsed=0

  while [ $elapsed -lt $timeout ]; do
    if curl -s "$backend_url" >/dev/null 2>&1; then
      return 0
    fi

    if [ $elapsed -ge $timeout ]; then
      return 1
    fi

    sleep 1
    elapsed=$((elapsed + 1))
  done

  return 1
}

function print_vm_ready() {
  local message="${1:-VM is ready!}"
  echo ""
  echo "$message"
  echo "  Backend: http://localhost:8000"
  echo "  Database: localhost:5433"
  echo "  SSH: cc-utils vm connect"
  echo ""
  echo "To stop: cc-utils vm stop"
}
