### Fixing Hash Mismatches in Nix

Nix uses **fixed-output derivations** to fetch external dependencies (from npm, crates.io, GitHub, etc.).
These derivations require a cryptographic hash to verify that the fetched content matches what's expected,
ensuring reproducibility and security.

When a fixed-output dependency changes, so will its hash, causing a hash mismatch error in Nix.
This generally happens in two scenarios:
1. Intentional updates: You upgrade a package version
2. Upstream changes: The upstream package was modified without a version change

If you encounter a hash mismatch without updating anything it should probably be investigated: it means
the external source changed unexpectedly.

#### pnpm Dependencies

This only applies to the `frontend` package.

The following error occurs when a dependency has changed but the Nix hash has not:
```
> ERR_PNPM_NO_OFFLINE_TARBALL  A package is missing from the store but cannot download it in offline mode. The missing package may be downloaded from https://registry.npmjs.org/@automerge/prosemirror/-/prosemirror-0.2.0-alpha.0.tgz.
> ERROR: pnpm failed to install dependencies
```

In this case you can follow the instructions given below the error message:
```
> If you see ERR_PNPM_NO_OFFLINE_TARBALL above this, follow these to fix the issue:
> 1. Set pnpmDeps.hash to "" (empty string)
> 2. Build the derivation and wait for it to fail with a hash mismatch
> 3. Copy the 'got: sha256-' value back into the pnpmDeps.hash field
```

The hash is located in `packages/frontend/default.nix` within the `pkgs.fetchPnpmDeps` block.
You can search for the text "hash" to find it quickly.

The frontend package can be built by running the command `nix build .#frontend` in the repository root.
This will build the minimum needed to print the hash mismatch described in the instructions.


#### Other Dependencies

Dependencies other than `pnpm` will have hash mismatch errors that look like this:
```
error: hash mismatch in fixed-output derivation '/nix/store/9ydq26vqirys8i3p9yx2ljxj8l9ynlgs-wasm-bindgen-cli-0.2.105.tar.gz.drv':
         specified: sha256-M6WuGl7EruNopHZbqBpucu4RWz44/MSdv6f0zkYw+44=
            got:    sha256-zLPFFgnqAWq5R2KkaTGAYqVQswfBEYm9x3OPjx8DJRY=
```

These can be fixed by finding the `specified` hash in the Nix configs and replacing it with the `got` hash.
Currently all hashes except for `pnpm` are defined in `flake.nix` in the repo root.

##### Dependencies with Hash Mismatches

You may encounter hash mismatches for these dependencies:
- wasm-bindgen-cli
- rust-toolchain
