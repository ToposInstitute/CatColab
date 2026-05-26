#!/usr/bin/env node
/**
 * catcolab-literate-typescript CLI.
 *
 * Usage:
 *   catcolab-literate-typescript <markdown-file>...
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { parse } from "./parse.mjs";
import { assemble } from "./assemble.mjs";
import { findPackageRoot, findTsConfig, markdownSlug, prepareOutDir } from "./paths.mjs";
import { materialise, typeCheck } from "./check.mjs";
import { runPairs } from "./run.mjs";
import { printFileReport, totalFailures } from "./report.mjs";

async function main() {
    const argv = process.argv.slice(2);
    if (argv.length === 0) {
        console.error("usage: catcolab-literate-typescript <markdown-file>...");
        process.exit(2);
    }

    /** @type {import('./report.mjs').FileReport[]} */
    const reports = [];

    for (const mdPathRaw of argv) {
        const mdPath = resolve(mdPathRaw);
        const text = readFileSync(mdPath, "utf8");
        const slug = markdownSlug(mdPath);
        const items = parse(text, slug);
        const { tsSamples, outputBodies } = assemble(items);

        const pkgRoot = findPackageRoot(mdPath);
        const tsconfigPath = findTsConfig(pkgRoot);
        const outDir = prepareOutDir(pkgRoot, slug);

        const materialised = materialise(tsSamples, outDir);
        const { diagnostics } = typeCheck(materialised, tsconfigPath, mdPathRaw);

        // Only attempt to run if type-checking passed; running broken samples
        // produces noisier failures.
        let runFailures = [];
        if (diagnostics.length === 0) {
            runFailures = await runPairs(materialised, outputBodies, pkgRoot, tsconfigPath);
        }

        const runCount = countRunnable(materialised, outputBodies);

        const report = {
            mdPath: mdPathRaw,
            sampleCount: tsSamples.length,
            runCount,
            diagnostics,
            runFailures,
        };
        reports.push(report);
        printFileReport(report);
    }

    const total = totalFailures(reports);
    if (total > 0) {
        process.exit(1);
    }
}

/**
 * @param {import('./check.mjs').MaterialisedSample[]} files
 * @param {Map<string,string>} outputBodies
 */
function countRunnable(files, outputBodies) {
    let n = 0;
    for (const m of files) {
        if (outputBodies.has(`${m.sample.id}-output`)) n += 1;
    }
    return n;
}

main().catch(err => {
    console.error(err && err.stack ? err.stack : err);
    process.exit(1);
});
