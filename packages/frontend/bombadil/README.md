# Bombadil tests

https://antithesishq.github.io/bombadil/

Start the frontend and backend, then run from the repository root:

```bash
nix develop .#bombadil --command pnpm --filter frontend test:bombadil:logged-out --time-limit 5m --exit-on-violation
nix develop .#bombadil --command pnpm --filter frontend test:bombadil:logged-in --time-limit 5m --exit-on-violation
```

Add `--headless` to hide the browser. Logged-in runs create and delete a disposable
Firebase account using the development configuration; generated backend documents
remain. Treat traces and screenshots as sensitive.
