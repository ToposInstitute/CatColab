{
  craneLib,
  cargoArtifacts,
  rustSrc,
  rustBuildInputs,
}:
craneLib.cargoTest (
  {
    inherit cargoArtifacts;
    src = rustSrc;
    cargoTestExtraArgs = "--all-features";
  }
  // rustBuildInputs
)
