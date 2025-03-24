# CatColab document sync server

This package provides the [Automerge](https://automerge.org/) document sync
server for CatColab, written in TypeScript as a thin wrapper around
[`automerge-repo`](https://github.com/automerge/automerge-repo).

It is not very useful on its own and is intended to run in conjunction with the
CatColab [backend](../backend/). See there for more information.

### Updating pnpm Dependencies with Nix
Nix tracks dependencies using a fixed hash. If your pnpm dependencies change, you may encounter an error like:
```
ERR_PNPM_NO_OFFLINE_TARBALL  A package is missing from the store but cannot download it in offline mode.
```

To update the dependencies tracked by Nix:

#### Temporarily replace the hash
Find the line in your Nix file that looks like:
```
hash = "sha256-...";
```

Replace it with:
```
hash = pkgs.lib.fakeHash;
```

#### Re-deploy
Run your deployment command again. Nix will now compute the correct hash and fail with an error message like:
```
error: hash mismatch in fixed-output derivation '/nix/store/xyz-automerge-doc-server-pnpm-deps.drv':
         specified: sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=
            got:    sha256-tIgtzlslvm2A1UpwfVsYk3E9HkKJntu36gEtsFjswgo=
```

#### Update the hash
Replace pkgs.lib.fakeHash with the actual hash shown in the error message:
```
hash = "sha256-tIgtzlslvm2A1UpwfVsYk3E9HkKJntu36gEtsFjswgo=";
```

Now the dependencies are correctly tracked, and the build should proceed normally. Make sure to include the updated hash in a commit.

Yes, this is the official way of solving this in nix. No, there is no way to automate this with nix. Nix: where developer experience goes to die.
