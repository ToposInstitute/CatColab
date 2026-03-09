{
  craneLib,
  cargoArtifacts,
}:
craneLib.buildPackage {
  inherit cargoArtifacts;
  inherit (craneLib.crateNameFromCargoToml { cargoToml = ./Cargo.toml; }) pname;
  version = "0.1.0";

  cargoExtraArgs = "-p ccd";

  src = craneLib.cleanCargoSource ../..;

  meta = {
    mainProgram = "ccd";
  };
}
