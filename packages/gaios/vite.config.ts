import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import topLevelAwait from "vite-plugin-top-level-await";
import wasm from "vite-plugin-wasm";
import cssInjectedByJsPlugin from "vite-plugin-css-injected-by-js";
import solid from "vite-plugin-solid";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
    base: "./",
    plugins: [topLevelAwait(), wasm(), solid(), cssInjectedByJsPlugin()],

    resolve: {
        dedupe: getCommonDependencies(),
    },

    build: {
        minify: false,
        sourcemap: "inline",
        rollupOptions: {
            external: [
                "@automerge/automerge",
                "@automerge/automerge-repo",
                "@patchwork/rootstock",
                "@patchwork/context",
                "@patchwork/context/diff",
            ],
            input: "./src/index.ts",
            output: {
                format: "es",
                entryFileNames: "[name].js",
                chunkFileNames: "assets/[name]-[hash].js",
                assetFileNames: "assets/[name][extname]",
            },
            preserveEntrySignatures: "strict",
        },
    },
});

/**
 * Get common dependencies between gaios, frontend, and ui-components packages.
 * Needed to link other packages that use Solid.js:
 * https://github.com/solidjs/solid/issues/1472
 */
function getCommonDependencies(): string[] {
    const gaiosPkg = JSON.parse(readFileSync(resolve(__dirname, "./package.json"), "utf-8"));
    const frontendPkg = JSON.parse(
        readFileSync(resolve(__dirname, "../frontend/package.json"), "utf-8"),
    );
    const uiComponentsPkg = JSON.parse(
        readFileSync(resolve(__dirname, "../ui-components/package.json"), "utf-8"),
    );

    const gaiosDeps = new Set(Object.keys(gaiosPkg.dependencies || {}));
    const frontendDeps = new Set(Object.keys(frontendPkg.dependencies || {}));
    const uiComponentsDeps = new Set(Object.keys(uiComponentsPkg.dependencies || {}));

    // @ts-expect-error: intersection method does exist on Set in our
    // vite.config target i.e. NodeJS
    const commonDeps = gaiosDeps.intersection(frontendDeps).union(gaiosDeps.intersection(uiComponentsDeps));

    return Array.from(commonDeps);
}
