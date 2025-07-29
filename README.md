# CatColab

[![core docs](https://img.shields.io/badge/core_docs-D34516.svg)](https://next.catcolab.org/dev/rust/catlog/)
[![frontend
docs](https://img.shields.io/badge/frontend_docs-28607F.svg)](https://next.catcolab.org/dev/frontend)
[![zulip](https://img.shields.io/badge/zulip-join_chat-brightgreen.svg)](https://catcolab.zulipchat.com)

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

The production deployment, tracking the latest
[release](https://github.com/ToposInstitute/CatColab/releases), is available at
<https://catcolab.org>. For more about the project and where it's going, see the
[help page](https://catcolab.org/help) and our blog posts about the releases so
far:

- [v0.1: Hummingbird](https://topos.institute/blog/2024-10-02-introducing-catcolab/)
- [v0.2: Wren](https://topos.institute/blog/2025-02-05-catcolab-0-2-wren/)

> [!WARNING]
> CatColab is under active development with new features added regularly. We aim
> to preserve the integrity of your data but you should not store anything
> critical or sensitive.


## For developers

> See <https://next.catcolab.org/dev> for developer information, including contribution guidelines.

CatColab is written in a mix of [Rust](https://www.rust-lang.org/) and
[TypeScript](https://www.typescriptlang.org/).

The staging deployment, synced to the `main` branch, is available at
<https://next.catcolab.org>.


## For mathematicians

> See <https://next.catcolab.org/math> for mathematical details

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
beyond. Incomplete bibliographies are in the [math
docs](https://next.catcolab.org/dev/bib-0001.xml) and the [core
docs](https://next.catcolab.org/dev/rust/catlog/refs). 
