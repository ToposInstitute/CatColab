#!/usr/bin/env bash

set -e

function print_help {
  echo "Usage: $0 <subcommand> [options]"
  echo ""
  echo "Subcommands:"
  echo "  reset                 Reset a target database (currently only supports 'local')"
  echo "  load                  Load a dump file into a target (currently only supports 'local'; target defaults to 'local')"
  echo "  dump                  Dump the target environment's database into a dump file"
  echo "  connect               Connect to a target environment's database (currently only supports 'local')"
  echo ""
  echo "Use '$0 <subcommand> --help' for more information on a command."
}

function print_reset_help {
  echo "Usage: $0 reset <target>"
  echo "Reset the target environment. Currently only 'local' is supported."
}

function print_load_help {
  echo "Usage: $0 load [options]"
  echo "Load a dump file into the specified target."
  echo ""
  echo "Options:"
  echo "  -t, --to <target>      Target environment to load to. Defaults to 'local'."
  echo "                         Valid values: local"
  echo "  -f, --from <dump_file> Dump file to load from (required)."
  echo "  -h, --help             Print this help message."
}

function print_dump_help {
  echo "Usage: $0 dump [options]"
  echo "Dump the target environment's database into a dump file."
  echo ""
  echo "Options:"
  echo "  -f, --from <target>    Target environment to dump from. Defaults to 'local'."
  echo "                         Valid values: local"
  echo "  -t, --to <dump_file>   Dump file to write to (optional)."
  echo "                         If not provided a default filename will be used:"
  echo "                           <target>_dump_<timestamp>.sql"
  echo "                         The dump file will be saved in the 'dumps' folder at the repository's git root."
  echo "  -h, --help             Print this help message."
}

function print_connect_help {
  echo "Usage: $0 connect <target>"
  echo "Connect to the target environment's database. Currently only 'local' is supported."
}


function load_env() {
  local varname="$1"
  local env_file="$2"

  if [ -z "$varname" ] || [ -z "$env_file" ]; then
    echo "Usage: load_env VARIABLE_NAME ENV_FILE"
    return 1
  fi

  if [ ! -f "$env_file" ]; then
    echo "Error: File '$env_file' not found."
    return 1
  fi

  local url
  url=$(grep "^$varname=" "$env_file" | cut -d '=' -f2-)

  if [ -z "$url" ]; then
    echo "Error: Variable '$varname' not found in $env_file"
    return 1
  fi

  local url_part="${url#postgresql://}"

  PGUSER=$(echo "$url_part" | awk -F[:@/] '{print $1}')
  PGPASSWORD=$(echo "$url_part" | awk -F[:@/] '{print $2}')
  PGHOST=$(echo "$url_part" | awk -F[:@/] '{print $3}')
  PGPORT=$(echo "$url_part" | awk -F[:@/] '{print $4}')
  PGDATABASE=$(echo "$url_part" | awk -F[:@/] '{print $5}')

  export PGUSER
  export PGPASSWORD
  export PGHOST
  export PGPORT
  export PGDATABASE
}

function find_git_root() {
  local dir="$PWD"
  while [ "$dir" != "/" ]; do
    if [ -d "$dir/.git" ]; then
      echo "$dir"
      return 0
    fi
    dir=$(dirname "$dir")
  done
  return 1  # not found
}


function load_target_env() {
  local target="$1"
  case "$target" in
    "local_superuser")
      load_env DATABASE_SUPERUSER_URL "$(find_git_root)/packages/backend/.env"
      ;;
    "local")
      load_env DATABASE_URL "$(find_git_root)/packages/backend/.env"
      ;;
    *)
      echo "Unknown target environment to load: $target"
      echo ""
      print_help
      exit 1
      ;;
  esac
}

function run_reset() {
  target="$1"
  if [[ "$target" == "--help" || "$target" == "-h" ]]; then
    print_reset_help
    exit 0
  fi

  if [[ -z "$target" ]]; then
    echo "Missing target argument."
    print_reset_help
    exit 1
  fi

  case "$target" in
    "local") ;;
    *)
      echo "Unsupported target for reset: $target"
      echo ""
      print_reset_help
      exit 1
      ;;
  esac


  echo "WARNING: This will reset the target database '$target' before loading the dump."
  read -rp "Are you sure you want to continue? [y/N] " confirm
  if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
    echo "Aborting."
    exit 1
  fi

  echo "Resetting target: $target..."
  load_target_env "local"
  local catcolab_password="$PGPASSWORD"

  load_target_env "local_superuser"

  if ! psql --dbname postgres -tAc "SELECT 1 FROM pg_roles WHERE rolname='catcolab'" | grep -q 1; then
    psql --dbname postgres --command "CREATE USER catcolab WITH ENCRYPTED PASSWORD '$catcolab_password';"
  fi

  psql --dbname postgres --command="SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'catcolab' AND pid <> pg_backend_pid();"
  psql --dbname postgres --command "DROP DATABASE IF EXISTS catcolab;"
  psql --dbname postgres --command "CREATE DATABASE catcolab;"
  psql --dbname postgres --command "ALTER DATABASE catcolab OWNER TO catcolab;"
  psql --dbname postgres --command "GRANT ALL PRIVILEGES ON DATABASE catcolab TO catcolab;"
  psql --dbname catcolab --command "GRANT ALL ON SCHEMA public TO catcolab;"

  cd "$(find_git_root)/packages/backend"
  sqlx migrate run
}

function run_load() {
  target="local"
  dump_file=""

  while [ "${1:-}" != "" ]; do
    case "$1" in
      "-t" | "--to")
        shift
        target="$1"
        ;;
      "-f" | "--from")
        shift
        dump_file="$1"
        ;;
      "-h" | "--help")
        print_load_help
        exit 0
        ;;
      *)
        echo "Unknown argument: $1"
        echo ""
        print_load_help
        exit 1
        ;;
    esac
    shift
  done

  case "$target" in
    "local") ;;
    *)
      echo "Unknown target: $target"
      echo ""
      print_load_help
      exit 1
      ;;
  esac

  if [[ -z "$dump_file" ]]; then
    echo "Missing dump file argument."
    print_load_help
    exit 1
  fi

  if [[ ! -f "$dump_file" ]]; then
    echo "Dump file not found: $dump_file"
    exit 1
  fi


  run_reset "$target"

  echo "Loading dump file '$dump_file' into target: $target..."
  load_target_env "$target"
  psql --dbname="$PGDATABASE" -f "$dump_file"
}
function run_dump() {
  target="local"
  dump_file=""

  while [ "${1:-}" != "" ]; do
    case "$1" in
      "-f" | "--from")
        shift
        target="$1"
        ;;
      "-t" | "--to")
        shift
        dump_file="$1"
        ;;
      "-h" | "--help")
        print_dump_help
        exit 0
        ;;
      *)
        echo "Unknown argument: $1"
        echo ""
        print_dump_help
        exit 1
        ;;
    esac
    shift
  done

  case "$target" in
    "local") ;;
    *)
      echo "Unknown target: $target"
      echo ""
      print_dump_help
      exit 1
      ;;
  esac

  # If dump_file is not provided, generate a default name.
  if [[ -z "$dump_file" ]]; then
    timestamp=$(date +"%Y%m%d_%H%M%S")
    dump_file="${target}_dump_${timestamp}.sql"
  fi

  # Ensure the dumps folder exists at the git repo root.
  repo_root=$(find_git_root)
  dumps_dir="${repo_root}/dumps"
  mkdir -p "$dumps_dir"
  dump_file="${dumps_dir}/${dump_file}"

  echo "Creating dump file '$dump_file' from target: $target..."
  load_target_env "$target"
  pg_dump > "$dump_file"
}

function run_connect() {
  target="$1"

  if [[ "$target" == "--help" || "$target" == "-h" ]]; then
    print_connect_help
    exit 0
  fi

  if [[ -z "$target" ]]; then
    echo "Missing target argument."
    print_connect_help
    exit 1
  fi

  case "$target" in
    "local") ;;
    *)
      echo "Unsupported target for connect: $target"
      echo ""
      print_connect_help
      exit 1
      ;;
  esac

  echo "Connecting to target: $target..."
  load_target_env "$target"
  psql
}

# Entry point
subcommand="$1"
shift || true

case "$subcommand" in
  "reset")
    run_reset "$@"
    ;;
  "load")
    run_load "$@"
    ;;
  "dump")
    run_dump "$@"
    ;;
  "connect")
    run_connect "$@"
    ;;
  "-h" | "--help" | "")
    print_help
    ;;
  *)
    echo "Unknown subcommand: $subcommand"
    echo ""
    print_help
    exit 1
    ;;
esac
