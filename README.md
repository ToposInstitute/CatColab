# CatColab

CatColab (working name) is a collaborative environment for

> formal, interoperable, conceptual modeling.

## For users

An early demo is available at <https://catcolab.org>.

> [!WARNING]
> CatColab is a pre-alpha software under active development.
> You are welcome to experiment but you should not store any important or
> sensitive data in the system.

## For developers

The staging deployment, synced to the `main` branch, is available at
<https://next.catcolab.org>. Documentation for developers is browsable at
<https://next.catcolab.org/dev/>.

CatColab is written in a mix of [Rust](https://www.rust-lang.org/) and
[TypeScript](https://www.typescriptlang.org/). To build it locally, first
install Rust (say by using [rustup](https://rustup.rs/)) and install npm (say by
using [nvm](https://github.com/nvm-sh/nvm)), then clone the repository and run

```bash
> npm install
> npm run build
> npm run dev
```

Finally, navigate your browser to the URL provided by Vite.

## For mathematicians

As the name suggests, CatColab is based on ideas from category theory. It is a
specific design goal that the system be usable *without* any knowledge of such
ideas. Nevertheless, for those curious about the underlying mathematics, here
are a few pointers for further reading.

CatColab is a tool for editing categorical structures and their morphisms and
higher morphisms. The meta-logical framework organizing these different
categorical structures is based on [double category
theory](https://mathoverflow.net/q/476936). To be more precise, the
**domain-specific logics** in CatColab are defined by [double
theories](https://arxiv.org/abs/2310.05384), and the **models** in CatColab are
models of double theories.

The various domain-specific logics available in CatColab are inspired by a wide
range of works from applied category theory and beyond. For incomplete
bibliographies, see the [dev docs](https://next.catcolab.org/dev/) and the [core
docs](https://next.catcolab.org/dev/rust/catlog/refs/).
