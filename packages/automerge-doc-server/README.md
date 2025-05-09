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


### Frozen lockfile
The error:
```
ERR_PNPM_OUTDATED_LOCKFILE  Cannot install with "frozen-lockfile" because pnpm-lock.yaml is not up to date with <ROOT>/package.json
```

Means that the `package.json` does not match `pnpm-lock.yaml`, mostly likely because you forgot to run forgot to run `pnpm install` after editting `package.json`.

## So you think you could get rid of this package, eh?

### Why we need a separate server for hosting automerge

tl;dr: there is, in practice, no automerge server for rust


At first glance, hosting Automerge on a separate server seems like unnecessary complexity. Since
Automerge is written in Rust and we already have a Rust server, why not simply integrate it there?
A quick Google search even turns up automerge-repo-rs, which includes a WebSocket handler for Axum
— perfect!

Not quite. A diligent developer would first inspect the tests before diving into implementation. If you
did that, you'd quickly notice that automerge-repo-rs is tested against automerge-repo 0.1.2, while we
are using 1.2.1, which is completely incompatible. That developer might also notice the cruel joke that
the protocol version is only checked by the server, meaning an up-to-date client will happily complete
the initial handshake with an outdated server.

Further investigation reveals that automerge-repo and automerge-repo-rs have significantly diverging
APIs, effectively forming separate ecosystems.

### Alternatives to Hosting the Node.js Automerge Server

1. Downgrade the Client to Automerge Repo 0.1.2
- This would break several things, though some might be fixable
- However, it would likely lock us into an outdated version indefinitely, which is obviously undesirable

2. Port the Node.js Server to Rust
- The server consists of fewer than 2,000 lines of TypeScript, which seems manageable
- An LLM could assist with the porting process, and we could reuse the existing tests
- However, maintaining this in Rust would introduce additional complexity, particularly given our current codebase
- This would be some tricky Rust code, especially in comparison to the existing codebase
- While this might be worth considering in the future, the opportunity cost seems high for now

### Key Components to Port (If We Go That Route)
- [network adapter](https://github.com/automerge/automerge-repo/tree/a0aae797a041d5d775adcb172cbb4f3e271100f3/packages/automerge-repo/src/network)
- [automerge-repo-network-websocket](https://github.com/automerge/automerge-repo/tree/a0aae797a041d5d775adcb172cbb4f3e271100f3/packages/automerge-repo-network-websocket)
