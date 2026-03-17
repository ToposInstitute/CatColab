# Fetch biome binary directly from GitHub releases so we can pin the
# exact version without hunting for a matching nixpkgs commit.
#
# To update: change `version`, then run `nix develop` — if the hashes are
# wrong, nix will tell you the correct ones.
{
  pkgs,
  system,
}:
let
  version = "2.3.8";
  platformMap = {
    "x86_64-linux" = {
      name = "biome-linux-x64-musl";
      hash = "sha256-pj8YPrCl7eo2u2wC+RtApinsIltPUUV144T04A32Npw=";
    };
    "x86_64-darwin" = {
      name = "biome-darwin-x64";
      hash = "sha256-xBt0o6DYZC0JprS3GC+i3jGEIo7f+PHSiRq1V8LraxE=";
    };
    "aarch64-darwin" = {
      name = "biome-darwin-arm64";
      hash = "sha256-p9AF4yYzIv6uPsXRqkHBTf4EelN7QuBqs9G+IxS5HII=";
    };
  };
  platform = platformMap.${system};
in
pkgs.stdenv.mkDerivation {
  pname = "biome";
  inherit version;
  src = pkgs.fetchurl {
    url = "https://github.com/biomejs/biome/releases/download/%40biomejs/biome%40${version}/${platform.name}";
    hash = platform.hash;
  };
  dontUnpack = true;
  installPhase = ''
    mkdir -p $out/bin
    cp $src $out/bin/biome
    chmod +x $out/bin/biome
  '';
  meta.mainProgram = "biome";
}
