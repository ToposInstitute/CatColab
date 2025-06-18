import { defineConfig } from "vite";
import topLevelAwait from "vite-plugin-top-level-await";
import wasm from "vite-plugin-wasm";
import cssInjectedByJsPlugin from "vite-plugin-css-injected-by-js";
import tailwindcss from "@tailwindcss/vite";
import solid from "vite-plugin-solid";

import { EXTERNAL_DEPENDENCIES } from "@patchwork/sdk/shared-dependencies";

export default defineConfig({
    base: "./",
    plugins: [
        topLevelAwait(),
        wasm(),
        solid(),
        tailwindcss(),
        cssInjectedByJsPlugin(),
    ],

    build: {
        minify: false,
        rollupOptions: {
            external: EXTERNAL_DEPENDENCIES,
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
