# CatColab

> [!WARNING]
> CatColab is a pre-alpha software under active development.

CatColab (working name) is a collaborative environment for

> formal, interoperable, conceptual modeling.

To build locally, first, be sure you have wasm-pack installed. Clone the repository and run

```bash
> npm install
> npm run build
```

from packages/frontend. This will build necessary WebAssembly, Typescript, and Javascript packages (via Vite.) Then, run 

```bash
> vite
```

and navigate your browser to the URL provided by Vite.
