#!/usr/bin/env bash

set -euo pipefail

# Database subcommand functions

function print_db_help {
  echo "Usage: $0 db <subcommand> [options]"
  echo ""
  echo "Subcommands:"
  echo "  reset                 Reset the local database"
  echo "  load                  Load a dump into a target (local|staging|production)"
  echo "  dump                  Dump a target (local|staging|production) database"
  echo "  connect               Connect to a target (local|staging|production)"
  echo ""
  echo "Use '$0 db <subcommand> --help' for more information."
}

function print_connect_help {
  echo "Usage: $0 db connect <target>"
  echo "Targets: local, staging, production"
}

function print_dump_help {
  echo "Usage: $0 db dump [options]"
  echo ""
  echo "Options:"
  echo "  -f, --from <target>    Target: local (default), staging, or production"
  echo "  -t, --to <filename>    Filename to write (defaults to './dumps/<target>_dump_<timestamp>.sql')"
  echo "  -q, --quiet            Only output the dump file path"
  echo "  -h, --help             Print this help message"
}

function print_load_help {
  echo "Usage: $0 db load [options]"
  echo ""
  echo "Options:"
  echo "  -t, --to <target>      Target: local (default), staging, or production"
  echo "  -f, --from <file|source>"
  echo "                         Dump file to load, or one of:"
  echo "                           local, staging, production"
  echo "                         to pick the most recent dump for that source"
  echo "  -h, --help             Print this help message"
  echo "  -s, --skip-migrations     Skip running migrations after loading"
}

function print_reset_help {
  echo "Usage: $0 db reset [options]"
  echo ""
  echo "Reset the local database by dropping and recreating it."
  echo ""
  echo "Options:"
  echo "  -s, --skip-migrations     Skip running migrations after resetting"
  echo "  -t, --to <target>      Target to reset (only 'local' is supported)"
  echo "  -h, --help             Print this help message"
}

function run_db() {
  local subcommand="${1-}"
  shift || true

  case "$subcommand" in
    connect)
      run_connect "$@"
      ;;
    dump)
      run_dump "$@"
      ;;
    load)
      run_load "$@"
      ;;
    reset)
      run_reset "$@"
      ;;
    "-h" | "--help" | "")
      print_db_help
      ;;
    *)
      echo "Unknown db subcommand: $subcommand"
      echo ""
      print_db_help
      exit 1
      ;;
  esac
}

function run_connect() {
  local target="$1"
  if [[ "$target" == "-h" || "$target" == "--help" ]]; then
    print_connect_help
    exit 0
  fi

  case "$target" in
    local|vm|staging|production)
      load_target_env "$target"
      psql
      ;;
    *)
      echo "Unknown target: $target"
      echo ""
      print_connect_help
      exit 1
      ;;
  esac
}

function run_dump() {
  local target="local"
  local dump_file=""
  local quiet=false

  while [[ ${1-} ]]; do
    case "$1" in
      "-f" | "--from")
        shift
        target="$1"
        ;;
      "-t" | "--to")
        shift
        dump_file="$1"
        ;;
      "-q" | "--quiet")
        quiet=true
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

  local dumps_dir="$(find_git_root)/dumps"
  mkdir -p "$dumps_dir"

  if [[ -z $dump_file ]]; then
    dump_file="${dumps_dir}/${target}_dump_$(date +%Y%m%d_%H%M%S).sql"
  else
    dump_file="${dumps_dir}/${dump_file}"
  fi

  case "$target" in
    local|vm|staging|production)
      if [[ "$quiet" != "true" ]]; then
        echo "Dumping $target to $dump_file..."
      fi
      load_target_env "$target"
      pg_dump --clean --if-exists > "$dump_file"
      if [[ "$quiet" == "true" ]]; then
        echo "$dump_file"
      fi
      ;;
    *)
      echo "Unknown target: $target"
      echo ""
      print_dump_help
      exit 1
      ;;
  esac
}

function run_load() {
  local target="local"
  local dump_file=""
  local skip_migrate=false

  while [[ ${1-} ]]; do
    case "$1" in
      "-s"|"--skip-migrations")
        skip_migrate=true
        ;;
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

  if [[ -z $dump_file ]]; then
    echo "Error: Missing dump specifier"
    print_load_help
    exit 1
  fi

  if [[ $dump_file =~ ^(local|staging|production)$ ]]; then
    local source_name="$dump_file"
    local files=("$(find_git_root)/dumps/${source_name}_dump_"*.sql)

    if [[ ${#files[@]} -eq 0 ]]; then
      echo "No dump files found for source '$source_name'."
      exit 1
    fi

    dump_file="${files[${#files[@]}-1]}"

    echo "Using most recent dump for '$source_name': $dump_file"
  fi

  if [[ ! -f $dump_file ]]; then
    echo "Dump not found: $dump_file"
    exit 1
  fi

  case "$target" in
    local|vm)
      load_target_env "$target"
      echo "Loading into $target..."
      psql -q --dbname="$PGDATABASE" -f "$dump_file"

      if [[ "$skip_migrate" != "true" ]]; then
        echo ""
        run_local_migrations
      fi
    ;;
    staging|production)
      echo "Error: Not allowed to modify target: $target"
      exit 1
    ;;
    *)
      echo "Unknown target: $target"
      echo ""
      print_load_help
      exit 1
      ;;
  esac
}

function run_reset() {
  local target="local"
  local skip_migrate=false

  while [[ ${1-} ]]; do
    case "$1" in
      "-s"|"--skip-migrations")
        skip_migrate=true
        ;;
      "-t" | "--to")
        shift
        target="$1"
        ;;
      "-h" | "--help")
        print_reset_help
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

  if [[ "$target" != "local" ]]; then
    echo "Error: reset only supports 'local'." >&2
    echo ""
    print_reset_help
    exit 1
  fi

  echo "WARNING: This will reset your local 'catcolab' database."
  read -n1 -r -p "Continue? [y/N] " yn
  if [[ $yn != [yY] ]]; then
    echo "Aborted."
    exit 1
  fi

  load_target_env local
  local pwd="$PGPASSWORD"
  load_target_env local_superuser

  if ! psql --dbname=postgres -tAc "SELECT 1 FROM pg_roles WHERE rolname='catcolab'" | grep -q 1; then
    psql --dbname=postgres --command "CREATE USER catcolab WITH ENCRYPTED PASSWORD '$pwd';"
  fi

  psql --dbname=postgres --command "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='catcolab' AND pid<>pg_backend_pid();"
  psql --dbname=postgres --command "DROP DATABASE IF EXISTS catcolab;"
  psql --dbname=postgres --command "CREATE DATABASE catcolab;"
  psql --dbname=postgres --command "ALTER DATABASE catcolab OWNER TO catcolab;"
  psql --dbname=catcolab --command "GRANT ALL ON SCHEMA public TO catcolab;"


  if [[ "$skip_migrate" != "true" ]]; then
    run_local_migrations
  fi
}
