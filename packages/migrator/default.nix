{
  pkgs,
  rustToolchain,
  ...
}:
let
  # see comment in packages/backend/default.nix
  buildRustCrateForPkgs =
    crate:
    pkgs.buildRustCrate.override {
      rustc = rustToolchain;
      cargo = rustToolchain;
    };

  cargoNix = import ../../Cargo.nix { inherit pkgs buildRustCrateForPkgs; };
  migrator = cargoNix.workspaceMembers.migrator.build;
in
migrator
