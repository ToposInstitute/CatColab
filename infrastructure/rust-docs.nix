{
  craneLib,
  cargoArtifacts,
  pkgs,
  checkMode ? false,
}:
craneLib.cargoDoc {
  inherit cargoArtifacts;

  cargoExtraArgs = "--all-features --workspace --exclude migrator";

  RUSTDOCFLAGS = if checkMode then "--deny warnings" else "";

  nativeBuildInputs = [
    pkgs.pkg-config
  ];

  buildInputs = [
    pkgs.openssl
  ];

  src = pkgs.lib.fileset.toSource {
    root = ../.;
    fileset = pkgs.lib.fileset.unions [
      ../Cargo.toml
      ../Cargo.lock
      (craneLib.fileset.commonCargoSources ../packages/backend)
      (craneLib.fileset.commonCargoSources ../packages/catlog)
      (craneLib.fileset.commonCargoSources ../packages/catlog-wasm)
      (craneLib.fileset.commonCargoSources ../packages/migrator)
      (craneLib.fileset.commonCargoSources ../packages/notebook-types)
      ../packages/backend/.sqlx
    ];
  };
}
