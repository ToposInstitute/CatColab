# Development Workflows

## Review a branch locally

```bash
# Start a VM from a remote branch with the staging database
# Uses the most recent staging dump in ./dumps/, or creates one if missing
cc-utils vm start my-feature-branch --db cached

# App available at http://localhost:8000
# No need to stop local development services

# Stop the VM when done
cc-utils vm stop
```

## Testing a migration against staging data

```bash
# Dump the staging database
# This will print the dump file path, e.g.: ./dumps/staging_dump_20240115_143022.sql
cc-utils db dump --from staging

# Create your migration in the migrator package
# See packages/migrator/README.md for instructions on creating migrations

# Load the dump into your local db (migrations run automatically after loading)
cc-utils db load --from ./dumps/staging_dump_20240115_143022.sql

# To iterate, edit the migration and re-run the load command
```

## Flexible development with db snapshots

```bash
# Dump the local database to ./dumps/local_snapshot.sql
cc-utils db dump --to local_snapshot.sql

# Load the snapshot without running migrations
cc-utils db load --from ./dumps/local_snapshot.sql --skip-migrations

# Manually run the migrations
cargo run -p migrator apply

# Get a clean DB
cc-utils db reset
```
