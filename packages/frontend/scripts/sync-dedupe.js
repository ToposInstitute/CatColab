#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const CHECK_MODE = process.argv.includes("--check");

// Read package.json files
const frontendPkgPath = resolve(__dirname, "../package.json");
const uiComponentsPkgPath = resolve(__dirname, "../../ui-components/package.json");
const viteConfigPath = resolve(__dirname, "../vite.config.ts");

const frontendPkg = JSON.parse(readFileSync(frontendPkgPath, "utf-8"));
const uiComponentsPkg = JSON.parse(readFileSync(uiComponentsPkgPath, "utf-8"));
const viteConfig = readFileSync(viteConfigPath, "utf-8");

// Find common dependencies (only runtime dependencies, not devDependencies)
const frontendDeps = new Set(Object.keys(frontendPkg.dependencies || {}));

const uiComponentsDeps = new Set(Object.keys(uiComponentsPkg.dependencies || {}));

const commonDeps = [...frontendDeps].filter((dep) => uiComponentsDeps.has(dep)).sort();

console.log("Common dependencies found:");
for (const dep of commonDeps) {
    console.log(`  - ${dep}`);
}

// Extract current dedupe array from vite.config.ts
const dedupeMatch = viteConfig.match(/dedupe:\s*\[([\s\S]*?)\]/);
if (!dedupeMatch) {
    console.error("Error: Could not find dedupe array in vite.config.ts");
    process.exit(1);
}

const currentDedupeContent = dedupeMatch[1];
const currentDedupe = currentDedupeContent
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s)
    .map((s) => s.replace(/^["']|["']$/g, ""))
    .sort();

console.log("\nCurrent dedupe config:");
for (const dep of currentDedupe) {
    console.log(`  - ${dep}`);
}

// Check if they match
const missingInConfig = commonDeps.filter((dep) => !currentDedupe.includes(dep));
const extraInConfig = currentDedupe.filter((dep) => !commonDeps.includes(dep));

if (missingInConfig.length === 0 && extraInConfig.length === 0) {
    console.log("\n✓ Dedupe config is up to date!");
    process.exit(0);
}

if (missingInConfig.length > 0) {
    console.log("\n⚠ Missing in dedupe config:");
    for (const dep of missingInConfig) {
        console.log(`  - ${dep}`);
    }
}

if (extraInConfig.length > 0) {
    console.log("\n⚠ Extra in dedupe config (not common dependencies):");
    for (const dep of extraInConfig) {
        console.log(`  - ${dep}`);
    }
}

if (CHECK_MODE) {
    console.error("\n✗ Dedupe config is out of sync. Run 'pnpm run sync-dedupe' to fix.");
    process.exit(1);
}

// Update vite.config.ts
console.log("\nUpdating vite.config.ts...");

// Format as multi-line array for readability
const indent = "            ";
const newDedupeArray = commonDeps.map((dep) => `"${dep}"`).join(`,\n${indent}`);
const newDedupeBlock = `dedupe: [\n${indent}${newDedupeArray},\n        ]`;

const newViteConfig = viteConfig.replace(/dedupe:\s*\[[\s\S]*?\]/, newDedupeBlock);

writeFileSync(viteConfigPath, newViteConfig, "utf-8");

console.log("✓ vite.config.ts updated successfully!");
console.log("\nNew dedupe config:");
for (const dep of commonDeps) {
    console.log(`  - ${dep}`);
}
