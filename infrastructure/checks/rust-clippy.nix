{
  craneLib,
  cargoArtifacts,
  rustSrc,
  rustBuildInputs,
}:
craneLib.cargoClippy (
  {
    inherit cargoArtifacts;
    src = rustSrc;
    cargoClippyExtraArgs = "--all-targets --all-features -- --deny warnings";
  }
  // rustBuildInputs
)
