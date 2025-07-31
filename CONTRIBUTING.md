> **Note:** This page can be viewed at either [next.catcolab.org/dev](https://next.catcolab.org/dev) or [github.com/ToposInstitute/CatColab/contribute](https://github.com/ToposInstitute/CatColab/contribute)


## Package documentation

| Grouping | Package | Language | Instructions | Documentation |
| :------- | :------ | :------- | :----------- | :------------ |
| Core | `catlog` | Rust | — | [/dev/rust/catlog](https://next.catcolab.org/dev/rust/catlog) |
| Frontend | `frontend` | TypeScript | — | [/dev/frontend/](https://next.catcolab.org/dev/frontend/) |
| | `catlog-wasm` | Rust | — | [/dev/rust/catlog_wasm](https://next.catcolab.org/dev/rust/catlog_wasm) |
| Backend | `backend` | Rust | [README](https://github.com/ToposInstitute/CatColab/tree/main/packages/backend) | [/dev/rust/catcolab_backend](https://next.catcolab.org/dev/rust/catcolab_backend) |
| | `automerge-doc-server` | TypeScript | [README](https://github.com/ToposInstitute/CatColab/tree/main/packages/automerge-doc-server) | — |


## Contributing

CatColab is written in a mix of [Rust](https://www.rust-lang.org/) and
[TypeScript](https://www.typescriptlang.org/). To start developing, install Rust
(say, by using [rustup](https://rustup.rs/)) and install
[pnpm](https://pnpm.io/), or use the [dev container](./.devcontainer/).

### Formatting and linting

To maintain a clean and consistent codebase, we follow strict conventions on
code formatting and style. To format and lint the frontend code, run these
commands:

```sh
cd packages/frontend
pnpm run format
pnpm run lint
```

To format and lint the Rust code, run these commands:

```sh
cargo fmt
cargo clippy
```

Try to remember to run these commands before making a PR. (If you forget, the CI
will remind you.)
