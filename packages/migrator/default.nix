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

  cargoExtraArgs = "-p migrator";

  nativeBuildInputs = [
    pkgs.pkg-config
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
    ];
  };

  meta = {
    mainProgram = pname;
  };
}
