{
  pkgsLinux,
  craneLib,
  cargoArtifacts,
  rustSrc,
  rustBuildInputs,
  rustToolchainLinux,
  pnpmDeps,
  inputs,
  self,
  nixos-generators,
}:
let
  # Helpers for frontend/site mode variants
  mkFrontend =
    mode:
    (pkgsLinux.callPackage ../packages/frontend/default.nix {
      inherit
        inputs
        rustToolchainLinux
        self
        mode
        ;
    }).package;

  mkSite =
    mode:
    pkgsLinux.callPackage ./site.nix {
      inherit self mode;
      pkgs = pkgsLinux;
    };
in
{
  catcolab-api = pkgsLinux.stdenv.mkDerivation {
    pname = "catcolab-api";
    version = "0.1.0";

    src = ../packages/backend/pkg;

    installPhase = ''
      mkdir -p $out
      cp -r * $out/
    '';
  };

  backend = pkgsLinux.callPackage ../packages/backend/default.nix {
    inherit craneLib cargoArtifacts;
    pkgs = pkgsLinux;
  };

  migrator = pkgsLinux.callPackage ../packages/migrator/default.nix {
    inherit craneLib cargoArtifacts;
    pkgs = pkgsLinux;
  };

  catlog-wasm-browser = pkgsLinux.callPackage ../packages/catlog-wasm/default.nix {
    inherit craneLib cargoArtifacts;
    pkgs = pkgsLinux;
  };

  frontend = mkFrontend "development";

  frontend-tests =
    (pkgsLinux.callPackage ../packages/frontend/default.nix {
      inherit inputs rustToolchainLinux self;
    }).tests;

  rust-docs = import ./rust-docs.nix {
    inherit
      craneLib
      cargoArtifacts
      rustSrc
      rustBuildInputs
      ;
  };

  dev-docs = pkgsLinux.callPackage ../dev-docs/default.nix { inherit pnpmDeps; };
  math-docs = pkgsLinux.callPackage ../math-docs/default.nix { };
  ui-components-storybook = pkgsLinux.callPackage ../packages/ui-components/default.nix {
    inherit pnpmDeps;
  };

  frontend-docs =
    (pkgsLinux.callPackage ../packages/frontend/default.nix {
      inherit inputs rustToolchainLinux self;
    }).docs;

  frontend-development = self.packages.x86_64-linux.frontend;
  frontend-staging = mkFrontend "staging";
  frontend-production = mkFrontend "production";

  site-development = mkSite "development";
  site-staging = mkSite "staging";
  site-production = mkSite "production";

  netlify-preview = pkgsLinux.callPackage ./netlify-preview.nix {
    inherit self;
    pkgs = pkgsLinux;
  };

  # VMs built with `nixos-rebuild build-vm` (like `nix build
  # .#nixosConfigurations.catcolab-vm.config.system.build.vm`) are not the same
  # as "traditional" VMs, which causes deploy-rs to fail when deploying to them.
  # https://github.com/serokell/deploy-rs/issues/85#issuecomment-885782350
  #
  # This is worked around by creating a full featured VM image.
  #
  # use:
  # nix build .#catcolab-vm
  # cp result/catcolab-vm.qcow2 catcolab-vm.qcow2
  # db-utils vm start
  # deploy -s .#catcolab-vm
  catcolab-vm = pkgsLinux.stdenv.mkDerivation {
    name = "catcolab-vm";
    src = nixos-generators.nixosGenerate {
      system = "x86_64-linux";
      format = "qcow";

      modules = [
        ./hosts/catcolab-vm
      ];

      specialArgs = {
        inherit inputs self;
        rustToolchain = rustToolchainLinux;
      };
    };
    installPhase = ''
      mkdir -p $out
      cp $src/nixos.qcow2 $out/catcolab-vm.qcow2
    '';
  };
}
