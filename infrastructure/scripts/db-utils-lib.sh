#!/usr/bin/env bash

set -euo pipefail

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

  # Decrypt if it’s an agenix file
  local content
  if [[ $env_file == *.age ]]; then
    pushd "$(dirname "$env_file")" >/dev/null
    content=$(agenix -d "$(basename "$env_file")")
    popd >/dev/null
  else
    content=$(<"$env_file")
  fi

  # extract VAR=
  local url
  url=$(printf '%s\n' "$content" | grep -E "^${varname}=" | cut -d '=' -f2-)
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
      load_env DATABASE_SUPERUSER_URL "$(find_git_root)/packages/backend/.env"
      ;;
    local)
      load_env DATABASE_URL "$(find_git_root)/packages/backend/.env"
      ;;
    staging)
      load_env DATABASE_URL "$(find_git_root)/infrastructure/secrets/.env.next.age"

      open_tunnel "catcolab" "backend-next.catcolab.org" "$STAGING_LOCAL_PGPORT" "$PGPORT" "STAGING_SSH_PID"

      export PGPORT="$STAGING_LOCAL_PGPORT"
      ;;
    production)
      load_env DATABASE_URL "$(find_git_root)/infrastructure/secrets/.env.prod.age"

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
