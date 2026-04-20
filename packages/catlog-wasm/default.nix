{
  craneLib,
  cargoArtifacts,
  pkgs,
}:
craneLib.buildPackage {
  inherit cargoArtifacts;
  inherit (craneLib.crateNameFromCargoToml { cargoToml = ./Cargo.toml; }) version pname;
  doCheck = false;

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
      (craneLib.fileset.commonCargoSources ../catlog)
      (craneLib.fileset.commonCargoSources ../notebook-types)
      ./package.json
    ];
  };

  # run wasm-pack instead of the default cargo
  buildPhase = ''
    cd packages/catlog-wasm
    # Run the wasm-pack command. wasm-pack will expect to find version of wasm-bindgen-cli in the
    # environment that must matches the version wasm-bindgen used in the Cargo.toml. The wasm-bindgen-cli
    # in the nix environment is defined an overlay in flake.nix.
    #
    # If the versions do not match there will be a build error when building with nix:
    # Error: Not able to find or install a local wasm-bindgen.
    #
    # With RUST_LOG=debug set there should be a log like indicating the exact problem:
    # Checking installed `wasm-bindgen` version == expected version: 0.2.105 == 0.2.106
    # 
    # wasm-pack needs a writeable $HOME
    # https://github.com/ipetkov/crane/issues/362
    HOME=$(mktemp -d) npm run build:browser
  '';

  installPhase = ''
    mkdir -p $out
    cp -r dist/pkg-browser/* $out/
    ls $out/
  '';
}
