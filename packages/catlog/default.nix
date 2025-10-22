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

  # Fileset for this package (relative to repo root)
  fileset = pkgs.lib.fileset.unions [
    ../../Cargo.toml
    ../../Cargo.lock
    (craneLib.fileset.commonCargoSources ./.)
    (craneLib.fileset.commonCargoSources ../notebook-types)
    ./examples
  ];

  # Common configuration shared between package build and tests
  common = {
    cargoExtraArgs = "-p catlog";

    buildInputs = [
      pkgs.openssl
    ];

    src = pkgs.lib.fileset.toSource {
      root = ../..;
      inherit fileset;
    };
  };
in
{
  # Export fileset for combining with other packages
  inherit fileset;

  # Export common configuration for reuse (e.g., in tests)
  inherit common;

  # The catlog package
  package = craneLib.buildPackage (common // {
    inherit cargoArtifacts pname version;
  });
}
