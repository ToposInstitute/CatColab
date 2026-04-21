{
  craneLib,
  cargoArtifacts,
  pkgs,
}:
craneLib.mkCargoDerivation {
  inherit cargoArtifacts;

  pname = "catcolab-api";
  version = "0.1.0";

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
      (craneLib.fileset.commonCargoSources ../packages/migrator)
      (craneLib.fileset.commonCargoSources ../packages/document-types-rs)
      ../packages/backend/.sqlx
    ];
  };

  SQLX_OFFLINE = "true";

  buildPhaseCargoCommand = ''
    cargo run -p backend -- generate-bindings
  '';

  doCheck = false;

  installPhaseCommand = ''
    mkdir -p $out/src
    cp -r packages/backend/pkg/src $out/
  '';
}
