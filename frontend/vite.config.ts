import { defineConfig } from 'vite'
import wasm from 'vite-plugin-wasm'
import topLevelAwait from 'vite-plugin-top-level-await'
import solid from 'vite-plugin-solid'

export default defineConfig({
    plugins: [wasm(), topLevelAwait(), solid()],
    build: {
        chunkSizeWarningLimit: 2000,
    }
})
