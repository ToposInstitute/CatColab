import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import solid from "vite-plugin-solid";
import wasm from "vite-plugin-wasm";
import { defineConfig } from "vitest/config";

// Vitest config for DOM-rendering tests. Selected explicitly via
// `vitest --config vitest.config.dom.ts`.
//
// We keep this separate from the default `vite.config.ts` because the
// API integration tests there assume a Node environment and do not need
// jsdom. Tests covered here mount Solid components and ProseMirror
// editors against an in-memory Automerge repo and require a real DOM.
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
    plugins: [wasm(), solid()],
    resolve: {
        dedupe: getCommonDependencies(),
        // Avoid the `solid` export condition resolving libraries to
        // untransformed `.jsx` source. We let `vite-plugin-solid` transform
        // sources from our packages, and use the prebuilt ESM (`import`
        // condition) for third-party libs like `lucide-solid`.
        conditions: ["development", "browser", "import", "module", "default"],
    },
    test: {
        environment: "jsdom",
        include: ["src/**/*.dom.test.ts", "src/**/*.dom.test.tsx"],
        fileParallelism: false,
        server: {
            deps: {
                // Ensure Solid component libraries are transformed by Vite
                // plugins instead of imported raw from node_modules.
                inline: [/solid-js/, /catcolab-ui-components/],
            },
        },
    },
});

function getCommonDependencies(): string[] {
    const frontendPkg = JSON.parse(readFileSync(resolve(__dirname, "./package.json"), "utf-8"));
    const uiComponentsPkg = JSON.parse(
        readFileSync(resolve(__dirname, "../ui-components/package.json"), "utf-8"),
    );
    const frontendDeps = new Set(Object.keys(frontendPkg.dependencies || {}));
    const uiComponentsDeps = new Set(Object.keys(uiComponentsPkg.dependencies || {}));
    // @ts-expect-error: Set.intersection exists in our Node target.
    const commonDeps = frontendDeps.intersection(uiComponentsDeps);
    return Array.from(commonDeps);
}
