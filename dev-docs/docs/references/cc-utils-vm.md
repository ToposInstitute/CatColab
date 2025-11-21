# cc-utils VM Commands Reference

The `cc-utils vm` commands provide tools for managing local NixOS VMs for testing and development.

## Available Commands

### start

```bash
cc-utils vm start [--skip-db]
```

Starts a local VM with the staging database loaded by default. Use `--skip-db` to skip loading the database.

### stop

```bash
cc-utils vm stop
```

Gracefully shuts down the running VM.

### status

```bash
cc-utils vm status
```

Shows whether the VM is running and displays the log file location.

### logs

```bash
cc-utils vm logs [--follow]
```

Displays VM logs. Use `--follow` (or `-f`) to tail the logs in real-time.

### connect

```bash
cc-utils vm connect
```

Opens an SSH connection to the running VM. Useful for inspecting the VM state or running commands manually.

### test-deploy

```bash
cc-utils vm test-deploy
```

Comprehensive test workflow that:
1. Builds a VM from the current staging branch on GitHub
2. Starts the VM
3. Copies the staging database to the VM
4. Deploys your current local branch to the running VM
5. Runs the frontend tests
