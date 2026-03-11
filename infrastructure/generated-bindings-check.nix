{
  craneLib,
  cargoArtifacts,
  pkgs,
}:
craneLib.mkCargoDerivation {
  inherit cargoArtifacts;

  pname = "generated-bindings-check";
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
      (craneLib.fileset.commonCargoSources ../packages/notebook-types)
      ../packages/backend/.sqlx
      ../packages/backend/pkg
    ];
  };

  SQLX_OFFLINE = "true";
  # Override crane's default of "false" to match the behavior developers get
  # in their shell. TypeId ordering depends on incremental compilation state.
  CARGO_BUILD_INCREMENTAL = "true";

  buildPhaseCargoCommand = ''
    cargo run -p backend -- generate-bindings
  '';

  checkPhaseCargoCommand = ''
    if ! diff -ru packages/backend/pkg.orig packages/backend/pkg --exclude node_modules; then
      echo "generate-bindings produced changes to packages/backend/pkg/."
      echo "Please run 'cargo run -p backend -- generate-bindings' and commit the result."
      exit 1
    fi
  '';

  installPhaseCommand = ''
    mkdir -p $out
  '';

  doCheck = true;

  # Save a copy of the original before building so we can diff afterwards
  preBuild = ''
    cp -r packages/backend/pkg packages/backend/pkg.orig
  '';
}
