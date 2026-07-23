import { monorepoDedupe } from "@catcolab-dev-tools/vite-plugin-monorepo-dedupe";
import solid from "vite-plugin-solid";
import wasm from "vite-plugin-wasm";
import { defineConfig } from "vitest/config";

export default defineConfig({
    plugins: [monorepoDedupe(), wasm(), solid()],
    test: {
        environment: "happy-dom",
        include: [
            "test/{cell-operations,cells,creating-and-editing,definitions,document-store,instantiation,notebook-editor,serialization,validation}.test.ts",
        ],
        typecheck: {
            enabled: true,
            tsconfig: "./tsconfig.test.json",
        },
    },
});
