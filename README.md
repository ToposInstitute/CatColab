# CatColab

CatColab (working name) is a collaborative environment for *formal,
interoperable, conceptual modeling*.

Elaborating on these keywords, CatColab aims to be:

- **Formal**: Models created in the system, be they qualitative or quantitative,
  are well-defined mathematical objects that can be critiqued with clarity.
- **Interoperable**: Models, and the logics in which they are expressed, can be
  flexibly interoperated with each other, without privileging any viewpoint as
  primary.
- **Conceptual**: Each domain-specific logic in the system is well adapted to
  the concepts used by practitioners in that domain.
- **Modeling**: Constructing a model is a collaborative, ongoing process that
  does not required participants to have specialized technical expertise.

## For users

An early demo is available at <https://catcolab.org>. For more about where the
project is going, try this [blog
post](https://topos.site/blog/2024-10-02-introducing-catcolab/).

> [!WARNING]
> CatColab is a pre-alpha software under active development.
> You are welcome to experiment but you should not store any important or
> sensitive data in the system.

## For developers

The staging deployment, synced to the `main` branch, is available at
<https://next.catcolab.org>. Documentation for developers is browsable at
<https://next.catcolab.org/dev/>.

CatColab is written in a mix of [Rust](https://www.rust-lang.org/) and
[TypeScript](https://www.typescriptlang.org/). To start developing, install
install Rust (say by using [rustup](https://rustup.rs/)) and install
[pnpm](https://pnpm.io/), or use the dev container (see below).

### Frontend development

To develop the frontend locally, clone the repository and run

```sh
pnpm install
pnpm run build
pnpm run dev --mode staging
```

Then navigate your browser to the URL provided by Vite.

Note that the flag `--mode staging` uses the staging deployment of the backend.
When this flag is omitted, the command `pnpm run dev` uses a local backend.

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

### Using the Dev Container

CatColab has experimental support for development using a dev container, which
simplifies the setup process by providing a pre-configured environment via a
Dockerfile. This is most useful for developers using [Visual Studio
Code](https://code.visualstudio.com/) or other editors that support the [dev
containers standard](https://containers.dev/).

To use the dev container:

1. Ensure you have a container runtime installed and running on your machine. You can refer to the [Open Container Initiative](https://opencontainers.org/) for more information on container standards and runtimes. For practical guidance, you might consider starting with [Docker's Get Started Guide](https://www.docker.com/get-started).
2. Open the CatColab repository in VS Code.
3. Open the VS Code command pallet by pressing `Cmd+Shift+P` on macOS or `Ctrl+Shift+P` on Linux
4. Issue the command "Dev Containers: Reopen in Container".
5. Once the container is running, the necessary setup commands will be executed automatically.
6. VS Code will prompt "Your application running on port 5173 is available. See all forwarded ports". Click the link to open the application in your browser.

## For mathematicians

As the name suggests, CatColab is based on mathematical ideas from category
theory. It is a specific design goal that the system be usable *without* any
knowledge of such ideas. Still, for those curious about the underlying
mathematics, here are a few pointers for further reading.

CatColab is an editor for categorical structures and their morphisms and higher
morphisms. The meta-logical framework organizing these categorical structures is
based on [double category theory](https://mathoverflow.net/q/476936). More
precisely, the **domain-specific logics** in CatColab are defined by [double
theories](https://arxiv.org/abs/2310.05384), and the **models** in CatColab are
models of double theories.

The library of domain-specific logics in CatColab, available now and to grow
over time, is inspired by a wide body of research in applied category theory and
beyond. Incomplete bibliographies are in the [dev
docs](https://next.catcolab.org/dev/bib-0001.xml) and the [core
docs](https://next.catcolab.org/dev/rust/catlog/refs/).
