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
