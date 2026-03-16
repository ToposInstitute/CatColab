# Julia packaging for CatColab: pre-built binary wrapped in an FHS environment.
#
# Julia doesn't work well with pure Nix packaging because it expects a standard
# Linux filesystem layout for native library loading. This fetches the official
# binary tarball and wraps it in a buildFHSEnv that provides libstdc++ and other
# native libraries needed by AlgebraicJulia packages.
{ pkgs }:
let
  juliaVersion = "1.11.6";

  julia = pkgs.stdenv.mkDerivation {
    name = "julia-${juliaVersion}";
    src = pkgs.fetchurl {
      url = "https://julialang-s3.julialang.org/bin/linux/x64/1.11/julia-${juliaVersion}-linux-x86_64.tar.gz";
      sha256 = "sha256-6Z5S4gKdhFCXxo8jctg2GG8Os/uJep3eC9+e6SUNA9U=";
    };

    sourceRoot = ".";
    dontBuild = true;
    dontStrip = true;

    installPhase = ''
      mkdir -p $out
      cp -r julia-*/* $out/
    '';
  };

  julia-fhs = pkgs.buildFHSEnv {
    name = "julia-interop";
    targetPkgs = pkgs: with pkgs; [
      julia
      gcc
      zlib
      glib
      openssl
      curl
    ];
    runScript = "${julia}/bin/julia";
  };
in
{
  inherit julia julia-fhs;
}
