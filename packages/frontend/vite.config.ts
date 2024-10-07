import { nodeTypes } from "@mdx-js/mdx";
import rehypeRaw from "rehype-raw";
import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import topLevelAwait from "vite-plugin-top-level-await";
import wasm from "vite-plugin-wasm";

// @ts-expect-error Types are missing.
// *Also*, this plugin causes Vite 5 to complain about CJS.
// https://github.com/nksaraf/vinxi/issues/289
import pkg from "@vinxi/plugin-mdx";
const { default: mdx } = pkg;

export default defineConfig({
    plugins: [
        wasm(),
        topLevelAwait(),
        mdx.withImports({})({
            jsx: true,
            jsxImportSource: "solid-js",
            providerImportSource: "solid-mdx",
            rehypePlugins: [[rehypeRaw, { passThrough: nodeTypes }]],
        }),
        solid({
            extensions: [".mdx", ".md"],
        }),
    ],
    build: {
        chunkSizeWarningLimit: 2000,
        sourcemap: false,
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
    },
});
