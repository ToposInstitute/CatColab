{
  description = "A flake for Rust development with OpenSSL on NixOS";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";

  outputs =
    { self, nixpkgs }:
    {
      devShells.x86_64-linux.default =
        let
          pkgs = import nixpkgs { system = "x86_64-linux"; };
        in
        pkgs.mkShell {
          name = "rust-dev-shell";
          buildInputs = with pkgs; [
            rustc
            cargo
            openssl
            rust-analyzer
            rustfmt
            clippy
            pkg-config
            pnpm
            nodejs_23
            sqlx-cli
            biome
          ];
        };
    };
}
