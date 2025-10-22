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

  # Common configuration shared between package build and tests
  common = {
    cargoExtraArgs = "-p catlog";

    buildInputs = [
      pkgs.openssl
    ];

    src = pkgs.lib.fileset.toSource {
      root = ../..;
      fileset = pkgs.lib.fileset.unions [
        ../../Cargo.toml
        ../../Cargo.lock
        (craneLib.fileset.commonCargoSources ./.)
        (craneLib.fileset.commonCargoSources ../notebook-types)
        ./examples
      ];
    };
  };
in
{
  # Export common configuration for reuse (e.g., in tests)
  inherit common;

  # The catlog package
  package = craneLib.buildPackage (common // {
    inherit cargoArtifacts pname version;
  });

  # Tests for the catlog package
  tests = craneLib.cargoNextest (common // {
    inherit cargoArtifacts;
  });
}
