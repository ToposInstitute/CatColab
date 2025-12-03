#!/usr/bin/env bash

set -euo pipefail

# Usage: database-setup.sh <catcolab database password>
#
# Environment:
#   Expects to be run as the postgres superuser or with PostgreSQL environment
#   variables for the superuser (PGUSER, PGHOST, PGPORT, etc.).

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <catcolab-password>" >&2
  exit 1
fi

password="$1"

# Create the user only if it doesn't already exist.
if ! psql --dbname=postgres -tAc "SELECT 1 FROM pg_roles WHERE rolname='catcolab'" | grep -q 1; then
  psql --dbname=postgres -c "CREATE USER catcolab WITH ENCRYPTED PASSWORD '$password';"
fi

# Create the database only if it doesn't already exist.
if ! psql --dbname=postgres -tAc "SELECT 1 FROM pg_database WHERE datname='catcolab'" | grep -q 1; then
  psql --dbname=postgres -c "CREATE DATABASE catcolab;"
fi

psql --dbname=postgres -c "ALTER DATABASE catcolab OWNER TO catcolab;"
psql --dbname=postgres -c "GRANT ALL PRIVILEGES ON DATABASE catcolab TO catcolab;"
psql --dbname=catcolab -c "GRANT ALL ON SCHEMA public TO catcolab;"
