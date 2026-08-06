import { fileURLToPath } from "node:url";
import { monorepoDedupe } from "@catcolab-dev-tools/vite-plugin-monorepo-dedupe";
import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import wasm from "vite-plugin-wasm";

// A standalone Vite app for the instances demo.
export default defineConfig({
    root: fileURLToPath(new URL(".", import.meta.url)),
    base: "./",
    plugins: [monorepoDedupe(), wasm(), solid()],
});
