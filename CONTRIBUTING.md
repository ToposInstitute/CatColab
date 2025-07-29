**TO-DO: write!**

## Information for developers

The staging deployment, synced to the `main` branch, is available at
<https://next.catcolab.org>. Documentation for developers is browsable at
<https://next.catcolab.org/dev/>.

CatColab is written in a mix of [Rust](https://www.rust-lang.org/) and
[TypeScript](https://www.typescriptlang.org/). To start developing, install Rust
(say by using [rustup](https://rustup.rs/)) and install
[pnpm](https://pnpm.io/), or use the [dev container](./.devcontainer/).

### Frontend development

To develop the frontend locally, clone the repository and run

```sh
pnpm install
pnpm run build
pnpm run dev --mode staging
```

Then navigate your browser to the URL provided by Vite. Note that the flag
`--mode staging` uses the staging deployment of the backend. For other options,
see the [frontend README](packages/frontend/).

### Backend development

Developing the backend locally requires more setup. See the instructions in the
[backend README](packages/backend/).

#### Test build for nixos deployment
```
nix flake check --no-sandbox
```

To get a interactive python session in the test environment:
```
nix run .#checks.x86_64-linux.integrationTests.driverInteractive --no-sandbox
```

#### Build and run nixos QEMU virtual machine
```
nix build .#nixosConfigurations.catcolab-vm.config.system.build.vm
./result/bin/run-catcolab-vm
```

The username and password of the vm is 'catcolab'

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