# @catcolab-dev-tools/literate-typescript

A minimal literate-TypeScript verifier for `.lts.md` Markdown documents.

For each `.lts.md` file passed on the command line, it:

1. Extracts fenced code blocks (`ts` and `tsx`), honouring three directives:
    - `<!-- verifier:prepend-to-following -->` — the next code fence becomes a
      prelude: it is concatenated above every subsequent code fence (in
      addition to being a sample itself). Use this to share imports/setup
      across samples without repeating them.
    - `<!-- verifier:throws -->` — the next code fence is expected to throw at
      runtime: it is executed and must exit non-zero. If it is followed by a
      non-code fence, that fence is matched as a substring of the runtime
      error output (stderr) instead of stdout. A red cross emoji (❌) in
      expected output is stripped before comparison, so it can be used to
      flag failure cases visually.
    - `<!-- verifier:reset -->` — clears the accumulated prepend stack so the
      next code fence starts fresh.
2. If a code fence is immediately followed by a non-code fence, the non-code
   fence is treated as that sample's expected stdout.
3. Writes each assembled sample to
   `<pkgRoot>/.lts/<markdownSlug>/<sampleId>.{ts,tsx}`, where `<pkgRoot>` is the
   directory of the nearest ancestor `package.json` of the markdown file. A
   sample is `tsx` if its body or any active prepend is a `tsx` fence.
4. Type-checks all materialised samples with the consuming package's TypeScript
   config (`tsconfig.lts.json` if present, else `tsconfig.json`). Use
   `@ts-expect-error` to assert that a particular line should fail to type-check.
5. For each sample with an expected-output fence, executes it with `tsx` and
   exact-compares stdout (after stripping ANSI escapes and trailing whitespace)
   against the expected output.

## Solid JSX (`tsx` fences)

`tsx` samples are intended for full Solid component examples:

- Before execution, the sample is compiled with Babel using
  `babel-preset-solid` — the same transform `vite-plugin-solid` applies — so
  Solid's fine-grained reactivity works exactly as in the browser. (The
  esbuild-based `tsx` CLI alone cannot do this; it only knows React-style JSX
  transforms.) The compiled output is written next to the sample as
  `<sampleId>.compiled.mjs`.
- happy-dom globals (`document`, `window`, ...) are registered automatically
  before the sample runs, so `render` from `solid-js/web` can mount components
  and examples can assert on `container.innerHTML`.
- Type-checking uses the consuming package's tsconfig; for Solid set
  `"jsx": "preserve"` and `"jsxImportSource": "solid-js"`, and include
  `.lts/**/*.tsx` alongside `.lts/**/*.ts` in `tsconfig.lts.json`.
- `solid-js` is resolved from the consuming package (it must be a dependency
  there); the Babel and happy-dom machinery is owned by this tool.

## Usage

```
literate-typescript path/to/file.lts.md [more.lts.md ...]
```

Add `.lts/` to the consuming package's `.gitignore`.
