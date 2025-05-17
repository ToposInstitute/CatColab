{
  pkgs,
  rustToolchain,
  ...
}:
let
  # Why do this instaed of creating a global overlay for rustc and cargo?
  #
  # Fenix can provide a rustc and cargo, however they are derivations, which means they are lacking many
  # of the attributes that other packages expect them to have. So creating an overlay with the fenix rustc
  # and cargo will cause other packages to break.
  #
  # The correct way to handle this is to use fenix to configure pkgs.rustPlatform, which other packages
  # should be using. However crate2nix does not use this API and instaed uses the older pkgs.buildRustCrate.
  # As a result we need to manually pass the rust toolchain to the cargoNix callsite.
  buildRustCrateForPkgs =
    crate:
    pkgs.buildRustCrate.override {
      rustc = rustToolchain;
      cargo = rustToolchain;
    };

  cargoNix = import ../../Cargo.nix { inherit pkgs buildRustCrateForPkgs; };
  backend = cargoNix.workspaceMembers.catcolab-backend.build;
in
backend.overrideAttrs (attrs: {
  postInstall = ''
    cp -r migrations $out/
  '';
})
