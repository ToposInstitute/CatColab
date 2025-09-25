import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";

export default defineConfig({
    plugins: [solid(), wasm(), topLevelAwait()],
    server: { port: 5175 },
    build: {
        target: "esnext",
        outDir: "dist",
        emptyOutDir: true,
        lib: {
            entry: "src/index.ts",
            name: "CatColabHazel",
            formats: ["es"],
            fileName: () => `index.js`,
        },
        rollupOptions: {
            external: ["solid-js"],
        },
    },
});


