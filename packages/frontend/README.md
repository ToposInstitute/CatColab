# CatColab frontend

This directory contains the web frontend for the CatColab application, written
in TypeScript using the [Solid.js](https://www.solidjs.com/) framework.

## Setup

Install Rust and Node.js 22+, then run

```sh
rush install
```

from the repo root. The Nix devShell (`nix develop`) puts both `rush` and
`rushx` on your `PATH`; otherwise install Rush globally with
`npm install -g @microsoft/rush`. Rush invokes pnpm under the hood.

## Usage

To develop the frontend locally, run

```sh
rush build --to-except frontend
cd packages/frontend
rushx dev -- --mode $MODE
```

where `$MODE` is replaced with one of the following:

- `staging`: uses the staging deployment of CatColab at `next.catcolab.org`
  (recommended for frontend development)
- `development`: assumes that the [backend](../backend/) is running locally (the
  default if `--mode` is omitted)
- `production`: uses the production deployment of CatColab at `catcolab.org`
  (_not_ recommended)

The first `rush build --to-except frontend` command builds the Wasm
packages, generated API bindings, and CSS module typings that the Vite
dev server depends on.

## Troubleshooting

### Nix Hash Mismatches

If this package fails to build in Nix with the error:

```
> ERROR: pnpm failed to install dependencies
```

Refer to the "pnpm Dependencies" section in [Fixing Hash Mismatches in
Nix](../../dev-docs/fixing-hash-mismatches.md).
