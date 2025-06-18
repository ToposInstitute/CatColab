import react from "@vitejs/plugin-react";
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
        solid({
            // Configure solid to work with .solid files and parent directory SolidJS files
            include: [
                "src/**/*.solid.tsx",
                "src/**/*.solid.ts",
                "../src/**/*.tsx",
                "../src/**/*.ts",
            ],
        }),
        react({
            // React should only handle our local React files
            include: ["src/**/*.tsx", "src/**/*.ts"],
            exclude: [/\.solid\.(tsx|ts)$/, "../src/**/*"],
        }),
        tailwindcss(),
        cssInjectedByJsPlugin(),
    ],

    build: {
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
