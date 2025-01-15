// vite.config.ts
import { nodeTypes } from "file:///Users/hamidahoderinwale/Topos/primary/CatColab/packages/frontend/node_modules/.pnpm/@mdx-js+mdx@2.3.0/node_modules/@mdx-js/mdx/index.js";
import rehypeRaw from "file:///Users/hamidahoderinwale/Topos/primary/CatColab/packages/frontend/node_modules/.pnpm/rehype-raw@7.0.0/node_modules/rehype-raw/index.js";
import { defineConfig } from "file:///Users/hamidahoderinwale/Topos/primary/CatColab/packages/frontend/node_modules/.pnpm/vite@5.4.8_@types+node@22.7.4/node_modules/vite/dist/node/index.js";
import solid from "file:///Users/hamidahoderinwale/Topos/primary/CatColab/packages/frontend/node_modules/.pnpm/vite-plugin-solid@2.10.2_solid-js@1.9.2_vite@5.4.8_@types+node@22.7.4_/node_modules/vite-plugin-solid/dist/esm/index.mjs";
import topLevelAwait from "file:///Users/hamidahoderinwale/Topos/primary/CatColab/packages/frontend/node_modules/.pnpm/vite-plugin-top-level-await@1.4.4_@swc+helpers@0.5.13_rollup@4.22.5_vite@5.4.8_@types+node@22.7.4_/node_modules/vite-plugin-top-level-await/exports/import.mjs";
import wasm from "file:///Users/hamidahoderinwale/Topos/primary/CatColab/packages/frontend/node_modules/.pnpm/vite-plugin-wasm@3.3.0_vite@5.4.8_@types+node@22.7.4_/node_modules/vite-plugin-wasm/exports/import.mjs";
import pkg from "file:///Users/hamidahoderinwale/Topos/primary/CatColab/packages/frontend/node_modules/.pnpm/@vinxi+plugin-mdx@3.7.2_@mdx-js+mdx@2.3.0/node_modules/@vinxi/plugin-mdx/dist/index.cjs";
var { default: mdx } = pkg;
var vite_config_default = defineConfig({
    plugins: [
        wasm(),
        topLevelAwait(),
        mdx.withImports({})({
            jsx: true,
            jsxImportSource: "solid-js",
            providerImportSource: "solid-mdx",
            rehypePlugins: [[rehypeRaw, { passThrough: nodeTypes }]],
        }),
        solid({
            extensions: [".mdx", ".md"],
        }),
    ],
    build: {
        chunkSizeWarningLimit: 2e3,
        sourcemap: false,
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
            usePolling: true,
            // polling may be more reliable within the container
        },
    },
});
export { vite_config_default as default };
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvVXNlcnMvaGFtaWRhaG9kZXJpbndhbGUvVG9wb3MvcHJpbWFyeS9DYXRDb2xhYi9wYWNrYWdlcy9mcm9udGVuZFwiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9maWxlbmFtZSA9IFwiL1VzZXJzL2hhbWlkYWhvZGVyaW53YWxlL1RvcG9zL3ByaW1hcnkvQ2F0Q29sYWIvcGFja2FnZXMvZnJvbnRlbmQvdml0ZS5jb25maWcudHNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfaW1wb3J0X21ldGFfdXJsID0gXCJmaWxlOi8vL1VzZXJzL2hhbWlkYWhvZGVyaW53YWxlL1RvcG9zL3ByaW1hcnkvQ2F0Q29sYWIvcGFja2FnZXMvZnJvbnRlbmQvdml0ZS5jb25maWcudHNcIjtpbXBvcnQgeyBub2RlVHlwZXMgfSBmcm9tIFwiQG1keC1qcy9tZHhcIjtcbmltcG9ydCByZWh5cGVSYXcgZnJvbSBcInJlaHlwZS1yYXdcIjtcbmltcG9ydCB7IGRlZmluZUNvbmZpZyB9IGZyb20gXCJ2aXRlXCI7XG5pbXBvcnQgc29saWQgZnJvbSBcInZpdGUtcGx1Z2luLXNvbGlkXCI7XG5pbXBvcnQgdG9wTGV2ZWxBd2FpdCBmcm9tIFwidml0ZS1wbHVnaW4tdG9wLWxldmVsLWF3YWl0XCI7XG5pbXBvcnQgd2FzbSBmcm9tIFwidml0ZS1wbHVnaW4td2FzbVwiO1xuXG4vLyBAdHMtZXhwZWN0LWVycm9yIFR5cGVzIGFyZSBtaXNzaW5nLlxuLy8gKkFsc28qLCB0aGlzIHBsdWdpbiBjYXVzZXMgVml0ZSA1IHRvIGNvbXBsYWluIGFib3V0IENKUy5cbi8vIGh0dHBzOi8vZ2l0aHViLmNvbS9ua3NhcmFmL3ZpbnhpL2lzc3Vlcy8yODlcbmltcG9ydCBwa2cgZnJvbSBcIkB2aW54aS9wbHVnaW4tbWR4XCI7XG5jb25zdCB7IGRlZmF1bHQ6IG1keCB9ID0gcGtnO1xuXG5leHBvcnQgZGVmYXVsdCBkZWZpbmVDb25maWcoe1xuICAgIHBsdWdpbnM6IFtcbiAgICAgICAgd2FzbSgpLFxuICAgICAgICB0b3BMZXZlbEF3YWl0KCksXG4gICAgICAgIG1keC53aXRoSW1wb3J0cyh7fSkoe1xuICAgICAgICAgICAganN4OiB0cnVlLFxuICAgICAgICAgICAganN4SW1wb3J0U291cmNlOiBcInNvbGlkLWpzXCIsXG4gICAgICAgICAgICBwcm92aWRlckltcG9ydFNvdXJjZTogXCJzb2xpZC1tZHhcIixcbiAgICAgICAgICAgIHJlaHlwZVBsdWdpbnM6IFtbcmVoeXBlUmF3LCB7IHBhc3NUaHJvdWdoOiBub2RlVHlwZXMgfV1dLFxuICAgICAgICB9KSxcbiAgICAgICAgc29saWQoe1xuICAgICAgICAgICAgZXh0ZW5zaW9uczogW1wiLm1keFwiLCBcIi5tZFwiXSxcbiAgICAgICAgfSksXG4gICAgXSxcbiAgICBidWlsZDoge1xuICAgICAgICBjaHVua1NpemVXYXJuaW5nTGltaXQ6IDIwMDAsXG4gICAgICAgIHNvdXJjZW1hcDogZmFsc2UsXG4gICAgfSxcbiAgICBzZXJ2ZXI6IHtcbiAgICAgICAgcHJveHk6IHtcbiAgICAgICAgICAgIFwiL2FwaVwiOiB7XG4gICAgICAgICAgICAgICAgdGFyZ2V0OiBcImh0dHA6Ly9sb2NhbGhvc3Q6ODAwMFwiLFxuICAgICAgICAgICAgICAgIHdzOiB0cnVlLFxuICAgICAgICAgICAgICAgIGNoYW5nZU9yaWdpbjogdHJ1ZSxcbiAgICAgICAgICAgICAgICByZXdyaXRlOiAocGF0aCkgPT4gcGF0aC5yZXBsYWNlKC9eXFwvYXBpLywgXCJcIiksXG4gICAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgICB3YXRjaDoge1xuICAgICAgICAgICAgdXNlUG9sbGluZzogdHJ1ZSwgLy8gcG9sbGluZyBtYXkgYmUgbW9yZSByZWxpYWJsZSB3aXRoaW4gdGhlIGNvbnRhaW5lclxuICAgICAgICB9LFxuICAgIH0sXG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7QUFBcVgsU0FBUyxpQkFBaUI7QUFDL1ksT0FBTyxlQUFlO0FBQ3RCLFNBQVMsb0JBQW9CO0FBQzdCLE9BQU8sV0FBVztBQUNsQixPQUFPLG1CQUFtQjtBQUMxQixPQUFPLFVBQVU7QUFLakIsT0FBTyxTQUFTO0FBQ2hCLElBQU0sRUFBRSxTQUFTLElBQUksSUFBSTtBQUV6QixJQUFPLHNCQUFRLGFBQWE7QUFBQSxFQUN4QixTQUFTO0FBQUEsSUFDTCxLQUFLO0FBQUEsSUFDTCxjQUFjO0FBQUEsSUFDZCxJQUFJLFlBQVksQ0FBQyxDQUFDLEVBQUU7QUFBQSxNQUNoQixLQUFLO0FBQUEsTUFDTCxpQkFBaUI7QUFBQSxNQUNqQixzQkFBc0I7QUFBQSxNQUN0QixlQUFlLENBQUMsQ0FBQyxXQUFXLEVBQUUsYUFBYSxVQUFVLENBQUMsQ0FBQztBQUFBLElBQzNELENBQUM7QUFBQSxJQUNELE1BQU07QUFBQSxNQUNGLFlBQVksQ0FBQyxRQUFRLEtBQUs7QUFBQSxJQUM5QixDQUFDO0FBQUEsRUFDTDtBQUFBLEVBQ0EsT0FBTztBQUFBLElBQ0gsdUJBQXVCO0FBQUEsSUFDdkIsV0FBVztBQUFBLEVBQ2Y7QUFBQSxFQUNBLFFBQVE7QUFBQSxJQUNKLE9BQU87QUFBQSxNQUNILFFBQVE7QUFBQSxRQUNKLFFBQVE7QUFBQSxRQUNSLElBQUk7QUFBQSxRQUNKLGNBQWM7QUFBQSxRQUNkLFNBQVMsQ0FBQyxTQUFTLEtBQUssUUFBUSxVQUFVLEVBQUU7QUFBQSxNQUNoRDtBQUFBLElBQ0o7QUFBQSxJQUNBLE9BQU87QUFBQSxNQUNILFlBQVk7QUFBQTtBQUFBLElBQ2hCO0FBQUEsRUFDSjtBQUNKLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
