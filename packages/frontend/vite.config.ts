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
import { documentationFileParser } from "./src/help/theory_documentation/theory_file_parser";
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
        documentationFileParser(),
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
        watch: {
            usePolling: true, // polling may be more reliable within the container
        },
    },
});
