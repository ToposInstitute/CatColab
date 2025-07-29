# Developer documentation and contribution guidelines

- **TO-DO: write!**

- **TO-DO: mention that you can also view this page at next.catcolab.org/dev (and also make this actually be true)**

- **TO-DO: include the following: infrastructure/README.md, next.catcolab.org/dev/rust, next.catcolab.org/dev/frontend, next.catcolab.org/dev/backend**

- **TO-DO: table of contents!**

| Package | Description | Language | Documentation |
| :-----: | :---------: | :------: | :-----------: |
| `catlog` | categorical logic core | Rust | [next.catcolab.org/dev/rust/catlog](https://next.catcolab.org/dev/rust/catlog) |
| `frontend` | web frontend | TypeScript | [next.catcolab.org/dev/frontend](https://next.catcolab.org/dev/frontend) |
| `catlog_wasm` | WebAssembly bindings (core ⇄ frontend) | Rust | [next.catcolab.org/dev/rust/catlog_wasm](https://next.catcolab.org/dev/rust/catlog_wasm) |
| `backend` | web server | Rust + PostgreSQL | [next.catcolab.org/dev/rust/catcolab_backend](https://next.catcolab.org/dev/rust/catcolab_backend) |

- **TO-DO: make a nice architecture diagram**

The staging deployment, synced to the `main` branch, is available at
[next.catcolab.org](https://next.catcolab.org).

CatColab is written in a mix of [Rust](https://www.rust-lang.org/) and
[TypeScript](https://www.typescriptlang.org/). To start developing, install Rust
(say by using [rustup](https://rustup.rs/)) and install
[pnpm](https://pnpm.io/), or use the [dev container](./.devcontainer/).



## Core development

> [!NOTE]
> See [next.catcolab.org/dev/rust/catlog](https://next.catcolab.org/dev/rust/catlog) for full documentation.



## Frontend development

> [!NOTE]
> See [next.catcolab.org/dev/frontend](https://next.catcolab.org/dev/frontend) for full documentation.

To develop the frontend locally, clone the repository and run

```sh
pnpm install
pnpm run build
pnpm run dev --mode staging
```

Then navigate your browser to the URL provided by Vite. Note that the flag
`--mode staging` uses the staging deployment of the backend, meaning that you don't have to worry about manually setting up a backend.



## Backend development

> [!NOTE]
> See [next.catcolab.org/dev/rust/catcolab_backend](https://next.catcolab.org/dev/rust/catcolab_backend) for full documentation.

Developing the backend locally requires more setup. See the `backend` documentation linked above.


### Test build for nixos deployment
```
nix flake check --no-sandbox
```

To get a interactive python session in the test environment:
```
nix run .#checks.x86_64-linux.integrationTests.driverInteractive --no-sandbox
```


### Build and run nixos QEMU virtual machine
```
nix build .#nixosConfigurations.catcolab-vm.config.system.build.vm
./result/bin/run-catcolab-vm
```

The username and password of the vm is 'catcolab'



## Contributing

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
