# shell.nix
{ pkgs ? import <nixpkgs> {} }:

pkgs.mkShell {
  # Swap ‘git’ for whatever you actually need.
  buildInputs = [
    pkgs.texlive.combined.scheme-full
    pkgs.fswatch
  ];
}
