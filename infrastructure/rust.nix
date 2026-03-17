{
  pkgsLinux,
  fenix,
  crane,
  linuxSystem,
}:
let
  rustToolchainFor =
    system:
    fenix.packages.${system}.fromToolchainFile {
      file = ../rust-toolchain.toml;
      sha256 = "sha256-vra6TkHITpwRyA5oBKAHSX0Mi6CBDNQD+ryPSpxFsfg=";
    };

  rustToolchainLinux = rustToolchainFor linuxSystem;

  craneLib = (crane.mkLib pkgsLinux).overrideToolchain rustToolchainLinux;

  rustToolchainNightly = fenix.packages.${linuxSystem}.latest.withComponents [
    "cargo"
    "rustfmt"
  ];
  craneLibNightly = (crane.mkLib pkgsLinux).overrideToolchain rustToolchainNightly;

  rustBuildInputs = {
    nativeBuildInputs = [ pkgsLinux.pkg-config ];
    buildInputs = [ pkgsLinux.openssl ];
  };

  cargoArtifacts = craneLib.buildDepsOnly (
    {
      src = craneLib.cleanCargoSource ../.;
      strictDeps = true;
    }
    // rustBuildInputs
  );

  # Shared Rust source filesets
  rustSrcBase = pkgsLinux.lib.fileset.unions [
    ../Cargo.toml
    ../Cargo.lock
    (craneLib.fileset.commonCargoSources ../packages/backend)
    (craneLib.fileset.commonCargoSources ../packages/catlog)
    (craneLib.fileset.commonCargoSources ../packages/catlog-wasm)
    (craneLib.fileset.commonCargoSources ../packages/migrator)
    (craneLib.fileset.commonCargoSources ../packages/notebook-types)
    ../packages/backend/.sqlx
  ];

  rustSrc = pkgsLinux.lib.fileset.toSource {
    root = ../.;
    fileset = rustSrcBase;
  };

  rustSrcWithExamples = pkgsLinux.lib.fileset.toSource {
    root = ../.;
    fileset = pkgsLinux.lib.fileset.unions [
      rustSrcBase
      ../packages/catlog/examples
      ../packages/notebook-types/examples
    ];
  };

  rustSrcBindings = pkgsLinux.lib.fileset.toSource {
    root = ../.;
    fileset = pkgsLinux.lib.fileset.unions [
      ../Cargo.toml
      ../Cargo.lock
      (craneLib.fileset.commonCargoSources ../packages/backend)
      (craneLib.fileset.commonCargoSources ../packages/migrator)
      (craneLib.fileset.commonCargoSources ../packages/notebook-types)
      ../packages/backend/.sqlx
      ../packages/backend/pkg
    ];
  };
in
{
  inherit
    rustToolchainFor
    rustToolchainLinux
    craneLib
    craneLibNightly
    cargoArtifacts
    rustSrc
    rustSrcWithExamples
    rustSrcBindings
    rustBuildInputs
    ;
}
