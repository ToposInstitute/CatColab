import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

export default defineConfig({
    plugins: [
        solid({
            ssr: true,
        }),
    ],
    build: {
        ssr: true,
        outDir: "dist-ssr",
        rollupOptions: {
            input: "src/entry-server.tsx",
            output: {
                format: "esm",
            },
            external: ["catlog-wasm", /\.wasm$/],
        },
    },
    ssr: {
        noExternal: ["solid-js", "@solidjs/router", "solid-firebase"],
        external: ["catlog-wasm"],
    },
});
