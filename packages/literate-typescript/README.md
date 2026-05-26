# catcolab-literate-typescript

A minimal literate-TypeScript verifier for `.lts.md` Markdown documents.

For each `.lts.md` file passed on the command line, it:

1. Extracts fenced `ts` code blocks as samples, honouring two directives:
   - `<!-- verifier:prepend-to-following -->` — the next sample is prepended to all following samples.
   - `<!-- verifier:reset -->` — clear the active prepend stack.
2. Writes each assembled sample to `<pkgRoot>/.lts/<markdownSlug>/<sampleId>.ts`, where
   `<pkgRoot>` is the directory of the nearest ancestor `package.json` of the markdown file.
3. Type-checks all materialised samples with the consuming package's TypeScript config
   (`tsconfig.lts.json` if present, else `tsconfig.json`). Use `@ts-expect-error` to assert
   that a particular line should fail to type-check.
4. For each sample `foo` that has a paired non-`ts` fence under `<!-- #foo-output -->`,
   executes the `.ts` file with `tsx` and exact-compares stdout (after stripping ANSI
   escapes and trailing whitespace) against the expected output.

## Usage

```
catcolab-literate-typescript path/to/file.lts.md [more.lts.md ...]
```

Add `.lts/` to the consuming package's `.gitignore`.

## Sample identification

A sample is identified by the `<!-- #my-id -->` comment immediately preceding its code
fence. If absent, an id is auto-generated from the slug of the markdown file and the line
number of the fence.
