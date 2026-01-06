import { defineConfig } from "vite";
import cssInjectedByJsPlugin from "vite-plugin-css-injected-by-js";
import solid from "vite-plugin-solid";
import topLevelAwait from "vite-plugin-top-level-await";
import wasm from "vite-plugin-wasm";

export default defineConfig({
    base: "./",
    plugins: [topLevelAwait(), wasm(), solid(), cssInjectedByJsPlugin()],

    build: {
        minify: false,
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
