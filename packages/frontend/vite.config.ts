import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import mdx from "@mdx-js/rollup";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";
import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import wasm from "vite-plugin-wasm";

// __dirname is not available in ES modules. The test:ci script uses --configLoader=runner
// (required for readonly (Nix) environments), which runs Vite in ESM mode.
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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
        dedupe: getCommonDependencies(),
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

/**
 * Get common dependencies between frontend and ui-components packages.
 * Needed to link other packages that use Solid.js:
 * https://github.com/solidjs/solid/issues/1472
 */
function getCommonDependencies(): string[] {
    const frontendPkg = JSON.parse(readFileSync(resolve(__dirname, "./package.json"), "utf-8"));
    const uiComponentsPkg = JSON.parse(
        readFileSync(resolve(__dirname, "../ui-components/package.json"), "utf-8"),
    );

    const frontendDeps = new Set(Object.keys(frontendPkg.dependencies || {}));
    const uiComponentsDeps = new Set(Object.keys(uiComponentsPkg.dependencies || {}));

    // @ts-expect-error: intersection method does exist on Set in our
    // vite.config target i.e. NodeJS
    const commonDeps = frontendDeps.intersection(uiComponentsDeps);

    return Array.from(commonDeps);
}
