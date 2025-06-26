# CatColab frontend

This directory contains the web frontend for the CatColab application, written
in TypeScript using the framework [Solid.js](https://www.solidjs.com/).

change
## Setup

Install Rust and [pnpm](https://pnpm.io/), then run

```sh
cd packages/frontend
pnpm install
pnpm run build
```

This command compiles the Rust dependencies to WebAssembly and then builds the
frontend bundle.

## Usage

To develop the frontend locally, run

```sh
pnpm run dev --mode $MODE
```

where `$MODE` is replaced with one of the following:

- `development`: assumes that the [backend](../backend/) is running locally (the
  default if `--mode` is omitted)
- `staging`: uses the staging deployment of CatColab at `next.catcolab.org`
  (recommended for fronten dev)
- `production`: uses the production deployment of CatColab at `catcolab.org`
  (*not* recommended)
