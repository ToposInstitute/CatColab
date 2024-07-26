{ inputs, lib, pkgs, ... }:

let
  inherit (lib) makeExtensible attrValues foldr;

  modules = import ./modules.nix {
    inherit lib;
    catcolab-lib.attrs = import ./attrs.nix { inherit lib; catcolab-lib = {}; };
  };

  inherit (modules) mapModules;

  catcolab-lib = makeExtensible (catcolab-lib:
    with catcolab-lib; mapModules ./.
      (file: import file { inherit inputs lib catcolab-lib pkgs; }));
in
catcolab-lib.extend
  (self: super:
    foldr (a: b: a // b) {} (attrValues super))
