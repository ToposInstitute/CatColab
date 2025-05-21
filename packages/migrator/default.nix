{
  pkgs,
  ...
}:
let
  cargoNix = pkgs.callPackage ../../Cargo.nix { };
  migrator = cargoNix.workspaceMembers.migrator.build;
in
migrator
