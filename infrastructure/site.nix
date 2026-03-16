{
  pkgs,
  self,
  mode ? "staging",
}:
let
  frontend = self.packages.${pkgs.system}."frontend-${mode}";
  devDocs = self.packages.${pkgs.system}.dev-docs;
  rustDocs = self.packages.${pkgs.system}.rust-docs;
  frontendDocs = self.packages.${pkgs.system}.frontend-docs;
  mathDocs = self.packages.${pkgs.system}.math-docs;
  uiComponents = self.packages.${pkgs.system}.ui-components-storybook;
in
pkgs.stdenv.mkDerivation {
  pname = "catcolab-site-${mode}";
  version = "0.1.0";
  dontUnpack = true;

  installPhase = ''
    mkdir -p $out

    # Frontend as root
    cp -r ${frontend}/* $out/

    # Dev docs
    mkdir -p $out/dev
    cp -r ${devDocs}/* $out/dev/
    mkdir -p $out/dev/rust
    cp -r ${rustDocs}/share/doc/* $out/dev/rust/
    mkdir -p $out/dev/frontend
    cp -r ${frontendDocs}/* $out/dev/frontend/
    mkdir -p $out/dev/ui-components
    cp -r ${uiComponents}/* $out/dev/ui-components/

    # Math docs
    mkdir -p $out/math
    cp -r ${mathDocs}/* $out/math/
  '';
}
