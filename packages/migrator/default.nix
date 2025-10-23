{
  craneLib,
  cargoArtifacts,
  pkgs,
}:
craneLib.buildPackage {
  inherit cargoArtifacts;
  inherit (craneLib.crateNameFromCargoToml { cargoToml = ./Cargo.toml; }) version pname;

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
    mainProgram = "migrator";
  };
}
