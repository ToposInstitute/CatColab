# Builds a target from build-targets.json via build.py (ninja). The source
# fileset is derived from the target's `inputs`, so ninja and nix share one
# dependency listing.
{
  craneLib,
  cargoArtifacts,
  pkgs,
  target,
}:
let
  root = ../.;
  targets = builtins.fromJSON (builtins.readFile (root + "/build-targets.json"));
  spec = targets.${target};
  toPath = rel: root + "/${rel}";
in
craneLib.buildPackage {
  inherit cargoArtifacts;
  inherit (craneLib.crateNameFromCargoToml { cargoToml = toPath "${spec.crate}/Cargo.toml"; })
    version
    pname
    ;
  doCheck = false;

  nativeBuildInputs = [
    (pkgs.python3.withPackages (ps: [ ps.ninja ]))
    pkgs.wasm-pack
    pkgs.wasm-bindgen-cli
    pkgs.binaryen
    pkgs.nodejs
  ];

  buildInputs = [
    pkgs.openssl
  ];

  src = pkgs.lib.fileset.toSource {
    inherit root;
    fileset = pkgs.lib.fileset.unions (
      map toPath (
        [
          "build.py"
          "build-targets.json"
        ]
        ++ spec.inputs
      )
    );
  };

  # wasm-pack expects a wasm-bindgen-cli in the environment matching the version in Cargo.lock;
  # see the overlay in flake.nix. It also needs a writeable $HOME (https://github.com/ipetkov/crane/issues/362).
  buildPhase = ''
    HOME=$(mktemp -d) python3 build.py ${target}
  '';

  installPhase = ''
    mkdir -p $out
    cp ${pkgs.lib.concatStringsSep " " spec.outputs} $out/
    ls $out/
  '';
}
