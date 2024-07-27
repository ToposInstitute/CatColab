import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import topLevelAwait from "vite-plugin-top-level-await";
import wasm from "vite-plugin-wasm";

export default defineConfig({
    plugins: [wasm(), topLevelAwait(), solid()],
    build: {
        chunkSizeWarningLimit: 2000,
    },
});
