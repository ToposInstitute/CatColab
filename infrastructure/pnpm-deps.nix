{ pkgsLinux }:
pkgsLinux.fetchPnpmDeps {
  hash = "sha256-GmumQtLYHqYci2UtrZQ5VK0X398R09b0MgnYkHsgiKw=";
  pname = "catcolab-pnpm-deps";
  fetcherVersion = 2;
  src = pkgsLinux.lib.fileset.toSource {
    root = ../.;
    fileset = pkgsLinux.lib.fileset.unions [
      ../.npmrc
      ../pnpm-workspace.yaml
      ../pnpm-lock.yaml
      ../dev-docs/package.json
      ../dev-docs/pnpm-lock.yaml
      ../packages/frontend/package.json
      ../packages/frontend/pnpm-lock.yaml
      ../packages/ui-components/package.json
      ../packages/ui-components/pnpm-lock.yaml
      ../packages/notebook-types/package.json
      ../packages/notebook-types/pnpm-lock.yaml
      ../packages/backend/pkg/package.json
      ../packages/backend/pkg/pnpm-lock.yaml
      ../packages/patchwork/package.json
      ../packages/patchwork/pnpm-lock.yaml
    ];
  };
}
