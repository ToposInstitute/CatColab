{
  naersk,
}:
let
  cargoToml = builtins.fromTOML (builtins.readFile ./Cargo.toml);

  # the nix package name and cargo package name should be the same
  name = cargoToml.package.name;
  version = cargoToml.package.version;
in

naersk.buildPackage {
  pname = name;
  version = version;

  src = ./.;

  # set the root to the repository root so Cargo.lock is found there
  root = ../../.;

  meta.mainProgram = name;

  postInstall = ''
    cp -r migrations $out/
  '';
}
