{ inputs, pkgs, lib, ... }:

with lib;
with lib.catcolab;
let sys = "x86_64-linux";
in
{
  # partially apply f
  # curry f {foo = 1;} {bar = 2;} == f {foo = 1; bar = 2;}
  curry = f: in1: in2: f (in2 // in1);

  mkHost = path: attrs @ { system ? sys, modules ? [], self, ... }:
    nixosSystem {
      inherit system;
      specialArgs = { inherit lib inputs self; };
      modules = [
        {
          nixpkgs.pkgs = pkgs;
          networking.hostName = mkDefault (removeSuffix ".nix" (baseNameOf path));
        }
        (import path)
      ] ++ modules;
    };

  mapHosts = dir: attrs @ { system ? system, ... }:
    mapModules dir
      (hostPath: mkHost hostPath attrs);

  addModules = modules: nodeFn: args:
    {
      imports = [(nodeFn args)] ++ modules;
      test-config.enable = true;
    };

  mkTest = { pkgs, path, modules }:
    let
      orig = import path;
      updated = orig // {
        nodes = mapAttrs (_: addModules modules) orig.nodes;
      };
    in
    pkgs.nixosTest updated;

  mapTests = dir: args:
    mapAttrs' (path: v:
      {
        name = (removeSuffix ".nix" (baseNameOf path));
        value = mkTest (args // { path = "${dir}/${path}"; });
      }
    )
      (builtins.readDir dir);
}
