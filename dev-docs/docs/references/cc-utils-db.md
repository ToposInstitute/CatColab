# cc-utils DB Commands Reference

The `cc-utils db` commands provide tools for managing databases across environments (local, staging, production, vm).

## Available Commands

### connect

```bash
cc-utils db connect <target>
```

Opens a `psql` connection to the specified database.

**Targets:** `local`, `staging`, `production`, `vm`

### dump

```bash
cc-utils db dump [--from <target>] [--to <filename>] [--quiet]
```

Creates a SQL dump file. Defaults to `local` and generates a timestamped filename.

**Options:**
- `--from`: Source database (local, staging, production, vm)
- `--to`: Output filename (stored in `./dumps/`)
- `--quiet`: Only output the dump file path

### load

```bash
cc-utils db load --from <file|source> [--to <target>] [--skip-migrations]
```

Loads a SQL dump into a database and runs migrations by default.

**Options:**
- `--from`: Dump file path or source name (local, staging, production) for most recent dump
- `--to`: Target database (local or vm)
- `--skip-migrations`: Skip running migrations after loading

### reset

```bash
cc-utils db reset [--skip-migrations]
```

Drops and recreates the local database. Only supports `local` target.

**Options:**
- `--skip-migrations`: Skip running migrations after reset
