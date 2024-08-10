{ self, pkgs, inputs,... }:

pkgs.mkShell {
  name = "catcolab-devshell";
  buildInputs = [
    inputs.agenix.packages.x86_64-linux.agenix
    inputs.deploy-rs.packages.x86_64-linux.default
  ];
}
