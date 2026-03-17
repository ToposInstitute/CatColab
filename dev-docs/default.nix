{
  pkgs,
  lib,
  pnpmDeps,
}:
pkgs.stdenv.mkDerivation {
  pname = "catcolab-dev-docs";
  version = "0.0.1";

  src = lib.fileset.toSource {
    root = ../.;
    fileset = lib.fileset.unions [
      ../.npmrc
      ../pnpm-workspace.yaml
      ../pnpm-lock.yaml
      ../dev-docs
      ../CONTRIBUTING.md
    ];
  };

  nativeBuildInputs = [ pkgs.pnpm.configHook ];
  buildInputs = [ pkgs.nodejs_24 ];

  inherit pnpmDeps;

  buildPhase = ''
    cd dev-docs
    npm run doc
  '';

  installPhase = ''
    mkdir -p $out
    cp -r output/* $out/
  '';
}
