# @catcolab-dev-tools/literate-typescript

A minimal literate-TypeScript verifier for `.lts.md` Markdown documents.

For each `.lts.md` file passed on the command line, it:

1. Extracts fenced code blocks, honouring two directives:
    - `<!-- verifier:prepend-to-following -->` — the next `ts` fence becomes a
      prelude: it is concatenated above every subsequent `ts` fence (in
      addition to being a sample itself). Use this to share imports/setup
      across samples without repeating them.
    - `<!-- verifier:reset -->` — clears the accumulated prepend stack so the
      next `ts` fence starts fresh.
2. If a `ts` fence is immediately followed by a non-`ts` fence, the non-`ts`
   fence is treated as that sample's expected stdout.
3. Writes each assembled sample to `<pkgRoot>/.lts/<markdownSlug>/<sampleId>.ts`,
   where `<pkgRoot>` is the directory of the nearest ancestor `package.json` of
   the markdown file.
4. Type-checks all materialised samples with the consuming package's TypeScript
   config (`tsconfig.lts.json` if present, else `tsconfig.json`). Use
   `@ts-expect-error` to assert that a particular line should fail to type-check.
5. For each sample with an expected-output fence, executes the `.ts` file with
   `tsx` and exact-compares stdout (after stripping ANSI escapes and trailing
   whitespace) against the expected output.

## Usage

```
literate-typescript path/to/file.lts.md [more.lts.md ...]
```

Add `.lts/` to the consuming package's `.gitignore`.
