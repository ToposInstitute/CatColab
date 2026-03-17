{
  pkgs,
  lib,
  pnpmDeps,
}:
pkgs.stdenv.mkDerivation {
  pname = "catcolab-ui-components-storybook";
  version = "0.0.0";

  src = lib.fileset.toSource {
    root = ../../.;
    fileset = lib.fileset.unions [
      ../../.npmrc
      ../../pnpm-workspace.yaml
      ../../pnpm-lock.yaml
      ../../packages/ui-components
    ];
  };

  nativeBuildInputs = [ pkgs.pnpm.configHook ];
  buildInputs = [ pkgs.nodejs_24 ];

  inherit pnpmDeps;

  buildPhase = ''
    cd packages/ui-components
    npm run build
  '';

  installPhase = ''
    mkdir -p $out
    cp -r storybook-static/* $out/
  '';
}
