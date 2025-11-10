#!/usr/bin/env node
/**
 * Prerender script that generates static HTML for the home page
 * This runs after the main build to inject SSR'd content
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function prerender() {
    try {
        // Load environment variables from .env.production (fallback to .env.development)
        config({ path: resolve(__dirname, "../.env.production") });
        if (!process.env.VITE_FIREBASE_OPTIONS) {
            config({ path: resolve(__dirname, "../.env.development") });
        }

        // Import the SSR bundle
        const { render } = await import("../dist-ssr/entry-server.js");

        // Render the home page
        const appHtml = render();

        // Read the built index.html
        const templatePath = resolve(__dirname, "../dist/index.html");
        const template = readFileSync(templatePath, "utf-8");

        // Inject the prerendered HTML
        const html = template.replace('<div id="root"></div>', `<div id="root">${appHtml}</div>`);

        // Write back to index.html
        writeFileSync(templatePath, html, "utf-8");

        console.log("✓ Home page prerendered successfully");
    } catch (error) {
        console.error("Failed to prerender:", error);
        process.exit(1);
    }
}

prerender();
