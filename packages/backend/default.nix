{
  self,
  craneLib,
  cargoArtifacts,
  pkgs,
}:
let
  crate = craneLib.crateNameFromCargoToml {
    cargoToml = ./Cargo.toml;
  };
  pname = crate.pname;
  version = crate.version;

  # Fileset for this package (relative to repo root)
  fileset = pkgs.lib.fileset.unions [
    ../../Cargo.toml
    ../../Cargo.lock
    (craneLib.fileset.commonCargoSources ./.)
    (craneLib.fileset.commonCargoSources ../notebook-types)
    ./.sqlx
  ];

  # Common configuration shared between package build and tests
  common = {
    cargoExtraArgs = "-p backend";

    nativeBuildInputs = [
      pkgs.pkg-config
    ];

    buildInputs = [
      pkgs.openssl
    ];

    src = pkgs.lib.fileset.toSource {
      root = ../..;
      inherit fileset;
    };
  };
in
{
  # Export fileset for combining with other packages
  inherit fileset;

  # Export common configuration for reuse (e.g., in tests)
  inherit common;

  # The backend package
  package = craneLib.buildPackage (common // {
    inherit cargoArtifacts pname version;

    buildInputs = common.buildInputs ++ [
      pkgs.makeWrapper
    ];

    propagatedBuildInputs = [
      self.packages.x86_64-linux.automerge
    ];

    postFixup = ''
      wrapProgram $out/bin/${pname} \
        --prefix PATH : ${pkgs.lib.makeBinPath [ self.packages.x86_64-linux.automerge ]}
    '';
    meta = {
      mainProgram = pname;
    };
  });
}
