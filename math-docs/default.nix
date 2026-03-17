{
  pkgs,
  lib,
}:
let
  forester = pkgs.fetchurl {
    url = "http://forester-builds.s3-website.us-east-2.amazonaws.com/forester-4.3.1-linux-x86_64.tar.gz";
    sha256 = "8e03600808a36c35ee70e2522c63566021accff27d6053897d2ca020664e5b57";
  };
  texEnv = pkgs.texlive.combine {
    inherit (pkgs.texlive)
      scheme-small
      dvisvgm
      standalone
      pgf
      tikz-cd
      amsmath
      quiver
      spath3
      ebproof
      ;
  };
in
pkgs.stdenv.mkDerivation {
  pname = "catcolab-math-docs";
  version = "0.1.0";

  src = lib.fileset.toSource {
    root = ./.;
    fileset = lib.fileset.unions [
      ./trees
      ./assets
      ./theme
      ./forest.toml
    ];
  };

  nativeBuildInputs = [ texEnv ];

  buildPhase = ''
    mkdir -p forester-bin
    tar -xf ${forester} -C forester-bin
    chmod +x forester-bin/forester
    ./forester-bin/forester build
  '';

  installPhase = ''
    mkdir -p $out
    cp -r output/* $out/
  '';
}
