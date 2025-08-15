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
    cp -r ${self.packages.x86_64-linux.backendPkg}/* ./backend/pkg/
    mkdir -p ./backend/pkg/node_modules

    mkdir ./frontend
    cp -r $src/* ./frontend
    cp -r $src/.* ./frontend

    cd ./frontend
  '';

  installPhase = ''
    # ln -s node_modules/ ../backend/pkg/node_modules
    cp -Lr node_modules/@qubit-rs ../backend/pkg/node_modules/
    cp -Lr node_modules/typescript ../backend/pkg/node_modules/
    ls -l ../backend/pkg/node_modules
    # this type errors on everything from backend/pkg, no idea why
    # ./node_modules/.bin/tsc -b
    # ./node_modules/.bin/vite build -- --sourcemap
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
