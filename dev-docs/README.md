# Developer Documentation

This directory contains documentation for CatColab developers working on testing, deployment, and local development workflows.

## Guides

### [Testing Guide](docs/testing-guide.md)
Learn how to run integration tests, test deployments, and debug test failures with a progressive isolation strategy.


### [Development Workflows](docs/workflows.md)
Example workflows demonstrating how to use `cc-utils` script for common development tasks.

## Reference

### [cc-utils vm](docs/references/cc-utils-vm.md)
Reference for `cc-utils vm` commands used to manage local NixOS VMs.

### [cc-utils db](docs/references/cc-utils-db.md)
Reference for `cc-utils db` commands used to manage databases across environments.

## Quick Start

**Run integration tests:**
```bash
nix build .#checks.x86_64-linux.frontendTests -L --no-sandbox
```

**Start a local VM:**
```bash
cc-utils vm start
```

**Test a deployment:**
```bash
cc-utils vm test-deploy
```

**Work with databases:**
```bash
# Dump staging database
cc-utils db dump --from staging

# Load into local
cc-utils db load --from ./dumps/staging_dump_*.sql
```
