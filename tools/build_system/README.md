# CatColab Build System

This is a minimal build system that can be used to:

- Generate and run a build.ninja file ([Ninja](https://ninja-build.org/) is a Make alternative).
- Be overridden with an env variable
  `CATCOLAB_BUILD_SYSTEM_RETRIEVE_FROM_NIX=true` to instead grab the files from
  a Nix flake build (i.e. from cache if already built). This works because we
  set up flake packages with the same name as the targets.

We currently only use this build system for our wasm targets and generated TypeScript bindings.
