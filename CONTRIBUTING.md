> **Note:** This page can be viewed at either [next.catcolab.org/dev](https://next.catcolab.org/dev) or [github.com/ToposInstitute/CatColab/contribute](https://github.com/ToposInstitute/CatColab/contribute)


## Package documentation

| Grouping | Package | Language | Instructions | Documentation |
| :------- | :------ | :------- | :----------- | :------------ |
| Core | `catlog` | Rust | — | [/dev/rust/catlog](https://next.catcolab.org/dev/rust/catlog) |
| Frontend | `frontend` | TypeScript | — | [/dev/frontend/](https://next.catcolab.org/dev/frontend/) |
| | `catlog-wasm` | Rust | — | [/dev/rust/catlog_wasm](https://next.catcolab.org/dev/rust/catlog_wasm) |
| Backend | `backend` | Rust | [README](https://github.com/ToposInstitute/CatColab/tree/main/packages/backend) | [/dev/rust/backend](https://next.catcolab.org/dev/rust/backend) |
| | `automerge-doc-server` | TypeScript | [README](https://github.com/ToposInstitute/CatColab/tree/main/packages/automerge-doc-server) | — |


## Development build

CatColab is written in a mix of [Rust](https://www.rust-lang.org/) and
[TypeScript](https://www.typescriptlang.org/). To start any development, the first steps are

1. install Rust (say, by using [rustup](https://rustup.rs/))
2. install [pnpm](https://pnpm.io/)
3. clone the [CatColab repository](https://github.com/ToposInstitute/CatColab)

### General development

"Most" development will likely only require changes to the **core** (`catlog`) and the **frontend** (`frontend`) (and thus also the **bindings** in `catlog-wasm`). For this, you can simply follow the instructions in the [`frontend` docs](https://next.catcolab.org/dev/frontend/), replacing `$MODE` by `staging`, i.e. running

```
pnpm run build && pnpm run dev --mode staging
```

to view any changes made.

### Backend development

If your development touches the actual backend (e.g. file storage) then you will need to **also** follow the [`backend` README](https://github.com/ToposInstitute/CatColab/tree/main/packages/backend).


## Formatting and linting

To maintain a clean and consistent codebase, we follow strict conventions on
code formatting and style. To format and lint the frontend code, run these
commands from the top-level directory:

```sh
pnpm --filter ./packages/frontend run format
pnpm --filter ./packages/frontend run lint
```

To format and lint the Rust code, run these commands from the top-level directory:

```sh
cargo fmt
cargo clippy
```

Try to remember to run these commands before making a PR. (If you forget, the CI
will remind you.)

## Developer documentation

Additional documentation for developers:

- [Fixing Hash Mismatches in Nix](./dev-docs/fixing-hash-mismatches.md)
