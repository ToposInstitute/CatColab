---
title: "Fixing hash mismatches in Nix"
---

### Fixing Hash Mismatches in Nix

#### pnpm Dependencies in the Frontend

This only applies to the `frontend` package. The pnpm hash is located in `packages/frontend/default.nix`
within the `pkgs.fetchPnpmDeps` block.

When a pnpm dependency has changed but the Nix hash has not, running `nix build .#frontend` will fail
with a hash mismatch that looks like this:
```
error: hash mismatch in fixed-output derivation '/nix/store/4wpp80j18vvm232ii1ajl2kqnbfgvzq2-frontend-pnpm-deps.drv':
         specified: sha256-vuBwhtNTTRbpgPZS+AQDybASYM9rwWYG8l0bscVQUso=
            got:    sha256-sxczRF8IsYqQzmAAv+IiFeWJygqHCVnSk8fEuy5d1JM=
```

This can be fixed by replacing the `specified` hash in `packages/frontend/default.nix` with the `got` hash.

You may also see a pnpm-specific error like this:
```
> ERR_PNPM_NO_OFFLINE_TARBALL  A package is missing from the store but cannot download it in offline mode.
> ERROR: pnpm failed to install dependencies
```

This will be accompanied by the hash mismatch above and can be fixed the same way.


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


#### Explanation

Nix uses **fixed-output derivations** to fetch external dependencies (from npm, crates.io, GitHub, etc.).
These derivations require a cryptographic hash to verify that the fetched content matches what's expected,
ensuring reproducibility and security.

When a fixed-output dependency changes, so will its hash, causing a hash mismatch error in Nix.
This generally happens in two scenarios:
1. Intentional updates: You upgrade a package version
2. Upstream changes: The upstream package was modified without a version change

If you encounter a hash mismatch without updating anything it should probably be investigated: it means
the external source changed unexpectedly.
