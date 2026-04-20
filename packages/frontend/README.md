# CatColab frontend

This directory contains the web frontend for the CatColab application, written
in TypeScript using the [Solid.js](https://www.solidjs.com/) framework.

## Setup

Install Rust and [pnpm](https://pnpm.io/), then run

```sh
cd packages/frontend
pnpm install
```

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
  (_not_ recommended)

Running the command above builds the Wasm and other local dependencies (by
running `pnpm run build:deps`) before launching the Vite preview server.

## Troubleshooting

### Nix Hash Mismatches

If this package fails to build in Nix with the error:

```
> ERROR: pnpm failed to install dependencies
```

Refer to the "pnpm Dependencies" section in [Fixing Hash Mismatches in
Nix](../../dev-docs/fixing-hash-mismatches.md).
