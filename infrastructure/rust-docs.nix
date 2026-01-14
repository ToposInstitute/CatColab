{
  craneLib,
  cargoArtifacts,
  pkgs,
}:
craneLib.cargoDoc {
  inherit cargoArtifacts;

  cargoExtraArgs = "--all-features --workspace --exclude migrator";

  RUSTDOCFLAGS = "--deny warnings";

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
