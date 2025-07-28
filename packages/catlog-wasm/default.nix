{
  craneLib,
  cargoArtifacts,
  pkgs,
}:
craneLib.buildPackage {
  inherit cargoArtifacts;
  inherit (craneLib.crateNameFromCargoToml { cargoToml = ./Cargo.toml; }) version pname;

  cargoExtraArgs = "-p catlog-wasm";

  nativeBuildInputs = [
    pkgs.wasm-pack
    pkgs.wasm-bindgen-cli
    pkgs.binaryen
  ];

  buildInputs = [
    pkgs.openssl
  ];

  src = pkgs.lib.fileset.toSource {
    root = ../..;
    fileset = pkgs.lib.fileset.unions [
      ../../Cargo.toml
      ../../Cargo.lock
      (craneLib.fileset.commonCargoSources ../catlog)
      (craneLib.fileset.commonCargoSources ./.)
      (craneLib.fileset.commonCargoSources ../notebook-types)
    ];
  };

  # run wasm-pack instead of the default cargo
  buildPhase = ''
    cd packages/catlog-wasm
    # WTF: engage maximum cargo cult. I have no idea wasm-pack needs $HOME set, that is wild.
    # https://github.com/NixOS/nixpkgs/blob/b5d0681604d2acd74818561bd2f5585bfad7087d/pkgs/by-name/te/tetrio-desktop/tetrio-plus.nix#L66C7-L66C24
    # https://discourse.nixos.org/t/help-packaging-mipsy-wasm-pack-error/51876
    HOME=$(mktemp -d) wasm-pack build --target nodejs
  '';

  installPhase = ''
    mkdir -p $out
    cp -r pkg/* $out/
    ls $out/
  '';
}
