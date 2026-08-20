import { monorepoDedupe } from "@catcolab-dev-tools/vite-plugin-monorepo-dedupe";
import external from "@inkandswitch/patchwork-bootloader/externals";
import { defineConfig } from "vite";
import cssInjectedByJsPlugin from "vite-plugin-css-injected-by-js";
import solid from "vite-plugin-solid";
import wasm from "vite-plugin-wasm";

export default defineConfig({
    base: "./",
    plugins: [monorepoDedupe(), wasm(), solid(), cssInjectedByJsPlugin()],

    build: {
        minify: false,
        sourcemap: "inline",
        target: "esnext",
        rollupOptions: {
            // Patchwork supplies these through its importmap. Notably this includes
            // `solid-js`, which must not be bundled: a second Solid runtime breaks
            // context lookups and click delegation against the host's copy.
            external,
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
