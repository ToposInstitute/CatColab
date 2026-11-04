import { monorepoDedupe } from "@catcolab-dev-tools/vite-plugin-monorepo-dedupe";
import { defaultServerConditions } from "vite";
import wasm from "vite-plugin-wasm";
import { defineConfig } from "vitest/config";

export default defineConfig({
    plugins: [monorepoDedupe(), wasm()],
    resolve: {
        conditions: ["browser", ...defaultServerConditions],
    },
    test: {
        environment: "happy-dom",
        server: { deps: { inline: [/solid-js/] } },
    },
});
