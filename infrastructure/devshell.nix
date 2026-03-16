{
  nixpkgsFor,
  inputs,
  rustToolchainFor,
}:
{
  devShellForSystem =
    system:
    let
      pkgs = nixpkgsFor system;
      rustToolchain = rustToolchainFor system;

      # macOS-specific configurations for libraries
      darwinDeps =
        if pkgs.stdenv.isDarwin then
          [
            pkgs.libiconv
          ]
        else
          [ ];

      nightlyRustfmt = inputs.fenix.packages.${system}.latest.rustfmt;
    in
    pkgs.mkShell {
      name = "catcolab-devshell";
      RUSTFMT = "${nightlyRustfmt}/bin/rustfmt";
      buildInputs =
        with pkgs;
        [
          darkhttpd
          esbuild
          lld
          netcat
          nodejs_24
          nix
          openssl
          pkg-config
          pnpm
          postgresql
          python3
          python312Packages.ipykernel
          python312Packages.jupyter-core
          python312Packages.jupyter-server
          python312Packages.requests
          python312Packages.websocket-client
          rustToolchain
          nightlyRustfmt
          sqlx-cli
          vscode-langservers-extracted
          wasm-bindgen-cli
          wasm-pack
        ]
        ++ darwinDeps
        ++ [
          inputs.agenix.packages.${system}.agenix
          inputs.deploy-rs.packages.${system}.default
          (import ./biome.nix { inherit pkgs system; })
        ];

      # macOS-specific environment variables for OpenSSL and pkg-config
      shellHook = ''
        ${
          if pkgs.stdenv.isDarwin then
            ''
              export OPENSSL_DIR=${pkgs.openssl.dev}
              export OPENSSL_LIB_DIR=${pkgs.openssl.out}/lib
              export OPENSSL_INCLUDE_DIR=${pkgs.openssl.dev}/include
              export PKG_CONFIG_PATH=${pkgs.openssl.dev}/lib/pkgconfig:$PKG_CONFIG_PATH
            ''
          else
            ""
        }

        export PATH=$PWD/infrastructure/scripts:$PATH

        # Load DATABASE_URL into the environment
        if [ -f packages/backend/.env ]; then
          export $(grep -v '^#' packages/backend/.env | xargs)
        fi
      '';
    };
}
