{
  craneLib,
  cargoArtifacts,
  pkgs,
}:
let
  crate = craneLib.crateNameFromCargoToml {
    cargoToml = ./Cargo.toml;
  };
  pname = crate.pname;
  version = crate.version;
in
craneLib.buildPackage {
  inherit cargoArtifacts pname version;

  cargoExtraArgs = "-p backend";

  nativeBuildInputs = [
    pkgs.pkg-config
  ];

  buildInputs = [
    pkgs.openssl
    pkgs.makeWrapper
  ];

  src = pkgs.lib.fileset.toSource {
    root = ../..;
    fileset = pkgs.lib.fileset.unions [
      ../../Cargo.toml
      ../../Cargo.lock
      (craneLib.fileset.commonCargoSources ./.)
      (craneLib.fileset.commonCargoSources ../migrator)
      (craneLib.fileset.commonCargoSources ../notebook-types)
      ./.sqlx
    ];
  };

  meta = {
    mainProgram = pname;
  };
}
