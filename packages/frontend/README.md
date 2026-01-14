# CatColab frontend

This directory contains the web frontend for the CatColab application, written
in TypeScript using the [Solid.js](https://www.solidjs.com/) framework.

## Setup

Install Rust and [pnpm](https://pnpm.io/), then run

```sh
cd packages/frontend
pnpm install
pnpm run build
```

This command compiles the Rust dependencies to WebAssembly and then builds the
`frontend` bundle.


## Usage

To develop the frontend locally, run

```sh
pnpm run dev --mode $MODE
```

where `$MODE` is replaced with one of the following:

- `staging`: uses the staging deployment of CatColab at `next.catcolab.org`
  (recommended for frontend development)
- `development`: assumes that the [backend](../backend/) is running locally (the
  default if `--mode` is omitted)
- `production`: uses the production deployment of CatColab at `catcolab.org`
  (*not* recommended)

## Troubleshooting

### Nix Hash Mismatches

If this package fails to build in Nix with the error: 
```
> ERROR: pnpm failed to install dependencies
```

Refer to the "pnpm Dependencies" section in [Fixing Hash Mismatches in
Nix](../../dev-docs/fixing-hash-mismatches.md).
