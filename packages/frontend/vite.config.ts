import { monorepoDedupe } from "@catcolab-dev-tools/vite-plugin-monorepo-dedupe";
import mdx from "@mdx-js/rollup";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";
import solid from "vite-plugin-solid";
import wasm from "vite-plugin-wasm";
import { defineConfig } from "vitest/config";

export default defineConfig({
    plugins: [
        monorepoDedupe(),
        wasm(),
        mdx({
            // https://mdxjs.com/docs/getting-started/#solid
            jsxImportSource: "solid-js/h",
            // https://mdxjs.com/guides/math/
            remarkPlugins: [remarkMath],
            rehypePlugins: [rehypeKatex],
        }),
        solid(),
    ],
    build: {
        chunkSizeWarningLimit: 2000,
        sourcemap: true,
        target: "es2022",
    },
    test: {
        // Run test files sequentially to prevent cross-test contamination via
        // the server's shared user state.
        fileParallelism: false,
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
