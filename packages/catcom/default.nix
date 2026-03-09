{
  craneLib,
  cargoArtifacts,
}:
craneLib.buildPackage {
  inherit cargoArtifacts;
  inherit (craneLib.crateNameFromCargoToml { cargoToml = ./Cargo.toml; }) pname;
  version = "0.1.0";

  cargoExtraArgs = "-p catcom";

  src = craneLib.cleanCargoSource ../..;

  meta = {
    mainProgram = "catcom";
  };
}
