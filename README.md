# CatColab

CatColab (working name) is a collaborative environment for

> formal, interoperable, conceptual modeling.

As the name suggests, CatColab is based on ideas from category theory,
yet it is a specific design goal that the system be usable without
any knowledge of such ideas.

## For users

An early demo is available at <https://catcolab.org>.

> [!WARNING]
> CatColab is a pre-alpha software under active development.
> You are welcome to experiment but please be aware that data
> created in the system may break or disappear at any time.

## For developers

The staging deployment, synced to the `main` branch, is available at <https://next.catcolab.org>.
Documentation for developers is browsable at <https://next.catcolab.org/dev/>.

To build locally, given you have npm and Rust installed, clone the repository and run

```bash
> npm install
> npm run build
> npm run dev
```

and navigate your browser to the URL provided by Vite.
