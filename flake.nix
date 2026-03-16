{
  description = "configurations for deploying catcolab";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixos-25.11";
    agenix.url = "github:ryantm/agenix";
    deploy-rs.url = "github:serokell/deploy-rs";
    fenix = {
      url = "github:nix-community/fenix";
      inputs.nixpkgs.follows = "nixpkgs";
    };
    crane = {
      url = "github:ipetkov/crane";
    };
    nixos-generators.url = "github:nix-community/nixos-generators";
  };

  outputs =
    {
      self,
      nixpkgs,
      deploy-rs,
      fenix,
      crane,
      nixos-generators,
      ...
    }@inputs:
    let
      linuxSystem = "x86_64-linux";

      devShellSystems = [
        "x86_64-linux"
        "x86_64-darwin"
        "aarch64-darwin"
      ];

      # Kept here to avoid circular deps between rust.nix and devshell.nix
      nixpkgsFor =
        system:
        import nixpkgs {
          inherit system;
          config.allowUnfree = true;
          overlays = [
            # Override wasm-bindgen-cli to match version used in Cargo.lock
            (final: prev: {
              wasm-bindgen-cli = prev.buildWasmBindgenCli rec {
                src = prev.fetchCrate {
                  pname = "wasm-bindgen-cli";
                  version = "0.2.106";
                  hash = "sha256-M6WuGl7EruNopHZbqBpucu4RWz44/MSdv6f0zkYw+44=";
                };
                cargoDeps = prev.rustPlatform.fetchCargoVendor {
                  inherit src;
                  inherit (src) pname version;
                  hash = "sha256-ElDatyOwdKwHg3bNH/1pcxKI7LXkhsotlDPQjiLHBwA=";
                };
              };
            })
          ];
        };

      pkgsLinux = nixpkgsFor linuxSystem;

      rust = import ./infrastructure/rust.nix {
        inherit
          pkgsLinux
          fenix
          crane
          linuxSystem
          ;
      };

      pnpmDeps = import ./infrastructure/pnpm-deps.nix { inherit pkgsLinux; };

      devshell = import ./infrastructure/devshell.nix {
        inherit nixpkgsFor inputs;
        rustToolchainFor = rust.rustToolchainFor;
      };

      hosts = import ./infrastructure/hosts {
        inherit
          nixpkgs
          deploy-rs
          inputs
          self
          pkgsLinux
          linuxSystem
          ;
        inherit (rust) rustToolchainLinux;
      };
    in
    {
      devShells = builtins.listToAttrs (
        map (system: {
          name = system;
          value = {
            default = devshell.devShellForSystem system;
          };
        }) devShellSystems
      );

      packages.x86_64-linux = import ./infrastructure/packages.nix {
        inherit
          pkgsLinux
          pnpmDeps
          inputs
          self
          nixos-generators
          ;
        inherit (rust)
          craneLib
          cargoArtifacts
          rustSrc
          rustBuildInputs
          rustToolchainLinux
          ;
      };

      inherit (hosts) nixosConfigurations;
      deploy.nodes = hosts.deployNodes;

      formatter = builtins.listToAttrs (
        map (system: {
          name = system;
          value =
            let
              pkgs = nixpkgsFor system;
            in
            pkgs.writeShellScriptBin "nixfmt-all" ''
              find "$@" -name '*.nix' -print0 | xargs -0 ${pkgs.nixfmt-rfc-style}/bin/nixfmt
            '';
        }) devShellSystems
      );

      checks.x86_64-linux = import ./infrastructure/checks {
        inherit
          pkgsLinux
          nixpkgs
          inputs
          self
          linuxSystem
          pnpmDeps
          ;
        inherit (rust)
          craneLib
          craneLibNightly
          cargoArtifacts
          rustSrc
          rustSrcWithExamples
          rustSrcBindings
          rustBuildInputs
          rustToolchainLinux
          ;
      };
    };
}
