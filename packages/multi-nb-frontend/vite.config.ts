import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import wasm from "vite-plugin-wasm";

export default defineConfig({
    plugins: [
        wasm(),
        solid(),
    ],
    build: {
        chunkSizeWarningLimit: 2000,
        sourcemap: true,
        target: "es2022",
    },
    server: {
        proxy: {
            "/api": {
                target: "http://localhost:8000",
                ws: true,
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/api/, ""),
            },
        },
        watch: {
            usePolling: true, // polling may be more reliable within the container
        },
    },
});
