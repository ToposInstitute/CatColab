{
  pkgs,
  inputs,
  self,
  ...
}:
let
  packageJson = builtins.fromJSON (builtins.readFile ./package.json);
  name = packageJson.name;
  version = packageJson.version;

  pkgsUnstable = import inputs.nixpkgsUnstable {
    system = "x86_64-linux";
  };
in
pkgs.stdenv.mkDerivation {
  pname = name;
  version = version;
  src = ./.;

  nativeBuildInputs = with pkgs; [
    pnpm_9.configHook
  ];

  buildInputs = with pkgs; [
    nodejs_24
  ];

  # package.json expects notebook-types to be at ../notebook-types, we COULD modify the parent of the nix
  # `build` directory, but this is technically unsupported. Instead we recreate part of the `packages`
  # directory structure in a way familiar to pnpm.
  unpackPhase = ''
    mkdir -p ./catlog-wasm/dist/pkg-browser
    cp -r ${self.packages.x86_64-linux.catlog-wasm-browser}/* ./catlog-wasm/dist/pkg-browser/

    mkdir -p ./backend/pkg
    cp -r ${self.packages.x86_64-linux.catcolabApi}/* ./backend/pkg/

    mkdir ./frontend
    cp -r $src/* ./frontend
    cp -r $src/.* ./frontend

    cd ./frontend
  '';

  installPhase = ''
    # The catcolab-api package is a bit odd since it's a built/generated dependency that's tracked by
    # git. Fortunately it shares dependencies with the frontend, so we can just copy them.
    mkdir -p ../backend/pkg/node_modules
    cp -Lr node_modules/@qubit-rs ../backend/pkg/node_modules/
    cp -Lr node_modules/typescript ../backend/pkg/node_modules/

    npm run build:nix

    mkdir -p $out
    cp -r ./dist/* $out
  '';

  pnpmDeps = pkgsUnstable.pnpm_9.fetchDeps {
    pname = name;

    fetcherVersion = "2";
    src = ./.;

    # See README.md
    # hash = "";
    hash = "sha256-kz6pxhBwD+BK6tgndZa7XoU/sqg9w7sV8DLhPZzxWPY=";
  };

  meta.mainProgram = name;
}
