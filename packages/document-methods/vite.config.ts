import { fileURLToPath } from "node:url";
import { monorepoDedupe } from "@catcolab-dev-tools/vite-plugin-monorepo-dedupe";
import solid from "vite-plugin-solid";
import wasm from "vite-plugin-wasm";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
    plugins: [monorepoDedupe(), wasm(), solid()],
    resolve: {
        // Vitest does not read tsconfig `paths`, so the specifiers used by the
        // example tests (mirroring the literate-typescript samples) are mapped
        // here instead.
        alias: [
            {
                find: "catcolab-documents",
                replacement: fileURLToPath(new URL("./src/future/index.ts", import.meta.url)),
            },
            {
                find: "catcolab-document-methods",
                replacement: fileURLToPath(new URL("./src/index.ts", import.meta.url)),
            },
            {
                find: /^catcolab-logics\/(.*)$/,
                replacement: `${root}test/literate-ts/catcolab-logics/$1.ts`,
            },
        ],
    },
    test: {
        environment: "happy-dom",
    },
});
