{
  pkgs,
  ...
}:
let
  cargoNix = pkgs.callPackage ../../Cargo.nix { };
  backend = cargoNix.workspaceMembers.catcolab-backend.build;
in
backend.overrideAttrs (attrs: {
  postInstall = ''
    cp -r migrations $out/
  '';
})
