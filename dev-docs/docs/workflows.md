# Development Workflows

## Database Workflows

These examples demonstrate how to combine the db commands for common development tasks.

### Example 1: Testing a migration against staging data

```bash
# 1. Dump the staging database
# This will print the dump file path, e.g.: ./dumps/staging_dump_20240115_143022.sql
cc-utils db dump --from staging

# 2. Create your migration in the migrator package
# See packages/migrator/README.md for instructions on creating migrations

# 3. Load the dump into your local db (migrations run automatically after loading)
cc-utils db load --from ./dumps/staging_dump_20240115_143022.sql

# 4. To iterate, edit the migration and re-run the load command
```

### Example 2: Flexible development with db snapshots

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
