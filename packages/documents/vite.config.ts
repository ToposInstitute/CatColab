import { fileURLToPath } from "node:url";
import { monorepoDedupe } from "@catcolab-dev-tools/vite-plugin-monorepo-dedupe";
import solid from "vite-plugin-solid";
import wasm from "vite-plugin-wasm";
import { defineConfig } from "vitest/config";

export default defineConfig({
    plugins: [monorepoDedupe(), wasm(), solid()],
    resolve: {
        alias: [
            {
                find: "catcolab-document-methods",
                replacement: fileURLToPath(
                    new URL("../document-methods/src/index.ts", import.meta.url),
                ),
            },
        ],
    },
    test: {
        environment: "happy-dom",
        typecheck: {
            enabled: true,
            tsconfig: "./tsconfig.test.json",
        },
    },
});
