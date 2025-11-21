# Testing Guide

## Running Integration Tests

To run the full integration tests (same as CI):

```bash
nix build .#checks.x86_64-linux.frontendTests -L --no-sandbox
```

This command runs the complete test suite in a NixOS VM, exactly as it runs in CI.

## Test Deployment

To test a deployment locally:

```bash
cc-utils vm test-deploy
```

This command:
1. Builds a VM from the current staging branch on GitHub
2. Starts the VM
3. Copies the staging database to the VM
4. Deploys your current local branch to the running VM
5. Runs the frontend tests

## Debugging Test Failures

When integration tests or deployment tests fail, debugging directly through the Nix commands can be slow due to long cycle times and complexity. Use this progressive debugging strategy to isolate the issue:

### Step 1: Sanity Check - Local Development Environment

**Frontend:**
```bash
cd packages/frontend
npm run test
```

**Backend:**
Start the automerge-doc-server and backend as you normally would for development.

**What this tests:** Basic functionality in your standard development setup.

### Step 2: CI Configuration Check

**Frontend:**
```bash
cd packages/frontend
npm run test:ci
```

**Backend:**
Same as Step 1 (development servers running).

**What this tests:** Whether the CI-specific vitest configuration causes test failures.

### Step 3: Nix Package Verification

**Frontend:**
```bash
nix build .#frontend-tests
./result/bin/frontend-tests
```

**Backend:**
Same as Step 1 (development servers running).

**What this tests:** Whether the Nix packaging of the frontend tests is working properly.

### Step 4: VM Backend Isolation

**Frontend:**
```bash
cd packages/frontend
npm run test
```

**Backend:**
Stop your development servers and start the VM:
```bash
cc-utils vm start
```

**What this tests:** Backend packaging, deployment, and VM configuration issues.

### Step 5: Full Integration

**Frontend:**
Same as Step 3 (Nix-built frontend-tests).

**Backend:**
Same as Step 4 (VM running via `cc-utils vm start`).

**What this tests:** The complete integration as it runs in CI, fully isolated from your development environment.

### Step 6: Manual Test Execution in VM

**Frontend:**
SSH into the running VM and execute tests manually:
```bash
cc-utils vm connect
frontend-tests
```

**Backend:**
VM must be running (use `cc-utils vm start` if needed).

**What this tests:** Manual execution inside the VM environment, useful for debugging test runner issues or inspecting the VM state.
