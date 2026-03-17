{
  craneLib,
  cargoArtifacts,
  rustSrc,
  rustBuildInputs,
  checkMode ? false,
}:
craneLib.cargoDoc (
  {
    inherit cargoArtifacts;
    src = rustSrc;
    cargoExtraArgs = "--all-features --workspace --exclude migrator";
    RUSTDOCFLAGS = if checkMode then "--deny warnings" else "";
  }
  // rustBuildInputs
)
