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
    pkgs.nodejs
  ];

  buildInputs = [
    pkgs.openssl
  ];

  src = pkgs.lib.fileset.toSource {
    root = ../..;
    fileset = pkgs.lib.fileset.unions [
      ../../Cargo.toml
      ../../Cargo.lock
      (craneLib.fileset.commonCargoSources ./.)
      ./package.json
      (craneLib.fileset.commonCargoSources ../catlog)
      (craneLib.fileset.commonCargoSources ../notebook-types)
    ];
  };

  # run wasm-pack instead of the default cargo
  buildPhase = ''
    cd packages/catlog-wasm
    # WTF: engage maximum cargo cult. I have no idea wasm-pack needs $HOME set, that is wild.
    # https://github.com/NixOS/nixpkgs/blob/b5d0681604d2acd74818561bd2f5585bfad7087d/pkgs/by-name/te/tetrio-desktop/tetrio-plus.nix#L66C7-L66C24
    # https://discourse.nixos.org/t/help-packaging-mipsy-wasm-pack-error/51876
    #
    # This just runs the wasm-pack command, it's a bit abstracted but it guarantees that we use the same
    # call to wasm-pack in dev and prod
    HOME=$(mktemp -d) npm run build:node
  '';

  installPhase = ''
    mkdir -p $out
    cp -r dist/pkg-node/* $out/
    ls $out/
  '';
}
