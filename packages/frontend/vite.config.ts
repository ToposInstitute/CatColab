import mdx from "@mdx-js/rollup";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";
import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import wasm from "vite-plugin-wasm";

export default defineConfig({
    plugins: [
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
    resolve: {
        // Needed to link other packages that use Solid.js:
        // https://github.com/solidjs/solid/issues/1472
        // Run `pnpm run sync-dedupe` to update this list with deps used in ui-components
        dedupe: [
            "@corvu/dialog",
            "@corvu/popover",
            "@corvu/resizable",
            "@corvu/tooltip",
            "@solid-primitives/destructure",
            "lucide-solid",
            "solid-js",
        ],
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
