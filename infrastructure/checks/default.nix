{
  pkgsLinux,
  nixpkgs,
  inputs,
  self,
  linuxSystem,
  craneLib,
  craneLibNightly,
  cargoArtifacts,
  rustSrc,
  rustSrcWithExamples,
  rustSrcBindings,
  rustBuildInputs,
  rustToolchainLinux,
  pnpmDeps,
}:
{
  frontendTests = import ./frontend-tests.nix {
    inherit
      nixpkgs
      inputs
      self
      linuxSystem
      ;
    rustToolchain = rustToolchainLinux;
  };

  rustFmt = import ./rust-fmt.nix {
    inherit craneLibNightly;
  };

  rustClippy = import ./rust-clippy.nix {
    inherit
      craneLib
      cargoArtifacts
      rustSrc
      rustBuildInputs
      ;
  };

  rustTests = import ./rust-tests.nix {
    inherit craneLib cargoArtifacts rustBuildInputs;
    rustSrc = rustSrcWithExamples;
  };

  rustDocsCheck = import ../rust-docs.nix {
    inherit
      craneLib
      cargoArtifacts
      rustSrc
      rustBuildInputs
      ;
    checkMode = true;
  };

  generatedBindingsCheck = import ./generated-bindings-check.nix {
    inherit craneLib cargoArtifacts rustBuildInputs;
    rustSrc = rustSrcBindings;
  };

  npmChecks = pkgsLinux.callPackage ./npm-checks.nix {
    inherit pnpmDeps;
    biome = import ../biome.nix {
      pkgs = pkgsLinux;
      system = linuxSystem;
    };
  };
}
