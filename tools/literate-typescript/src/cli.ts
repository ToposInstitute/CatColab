/**
 * literate-typescript CLI.
 *
 * Usage:
 *   literate-typescript <markdown-file>...
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { assemble } from "./assemble.ts";
import { type MaterialisedSample, materialise, typeCheck } from "./check.ts";
import { parse } from "./parse.ts";
import { findPackageRoot, findTsConfig, markdownSlug, prepareOutDir } from "./paths.ts";
import { type FileReport, printFileReport, totalFailures } from "./report.ts";
import { type RunFailure, runPairs } from "./run.ts";

async function main(): Promise<void> {
    const argv = process.argv.slice(2);
    if (argv.length === 0) {
        console.error("usage: literate-typescript <markdown-file>...");
        process.exit(2);
    }

    const reports: FileReport[] = [];

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
        let runFailures: RunFailure[] = [];
        if (diagnostics.length === 0) {
            runFailures = await runPairs(materialised, outputBodies, pkgRoot, tsconfigPath);
        }

        const runCount = countRunnable(materialised, outputBodies);

        const report: FileReport = {
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

function countRunnable(files: MaterialisedSample[], outputBodies: Map<string, string>): number {
    let n = 0;
    for (const m of files) {
        if (outputBodies.has(`${m.sample.id}-output`)) {
            n += 1;
        }
    }
    return n;
}

main().catch((err: unknown) => {
    if (err instanceof Error && err.stack) {
        console.error(err.stack);
    } else {
        console.error(err);
    }
    process.exit(1);
});
