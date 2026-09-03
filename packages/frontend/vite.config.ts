import { monorepoDedupe } from "@catcolab-dev-tools/vite-plugin-monorepo-dedupe";
import mdx from "@mdx-js/rollup";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";
import { defaultServerConditions } from "vite";
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
    optimizeDeps: {
        // Fixes error in vite dev server about `debug` module, a transitive
        // dependency of `solid-markdown`.
        include: [
            "solid-markdown > unified",
            "solid-markdown > remark-parse",
            "solid-markdown > remark-rehype",
        ],
    },
    // Vitest runs with node resolve conditions, which select solid-js's
    // non-reactive server build. vite-plugin-solid only fixes this when
    // vitest runs in mode "test", but our tests run in mode "development",
    // so prefer browser builds ourselves when running under vitest.
    resolve: process.env.VITEST ? { conditions: ["browser", ...defaultServerConditions] } : {},
    test: {
        // Run test files sequentially to prevent cross-test contamination via
        // the server's shared user state.
        fileParallelism: false,
        server: {
            deps: {
                // Process solid through vite so that a single, consistent
                // build of the reactive runtime is used everywhere.
                inline: [/solid-js/, /automerge-repo-solid-primitives/],
            },
        },
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
