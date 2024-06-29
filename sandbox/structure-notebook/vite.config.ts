import { defineConfig } from "vite";
import wasm from "vite-plugin-wasm";
import solid from "vite-plugin-solid";

export default defineConfig({
  plugins: [wasm(), solid()],
});
