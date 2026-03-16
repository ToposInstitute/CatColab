{
  pkgs,
  lib,
  pnpmDeps,
  biome,
}:
pkgs.stdenv.mkDerivation {
  pname = "catcolab-npm-checks";
  version = "0.0.0";

  src = lib.fileset.toSource {
    root = ../..;
    fileset = lib.fileset.unions [
      ../../.gitignore
      ../../.npmrc
      ../../biome.json
      ../../pnpm-workspace.yaml
      ../../pnpm-lock.yaml
      ../../packages/frontend
      ../../packages/ui-components
    ];
  };

  nativeBuildInputs = [
    pkgs.pnpm.configHook
    biome
  ];
  buildInputs = [ pkgs.nodejs_24 ];

  inherit pnpmDeps;

  BIOME_BINARY = lib.getExe biome;

  buildPhase = ''
    pnpm --filter "./packages/*" run ci
  '';

  installPhase = ''
    mkdir -p $out
    echo "npm checks passed" > $out/result.txt
  '';
}
