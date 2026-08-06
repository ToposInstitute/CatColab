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
import {
    cleanupAllOutDirs,
    cleanupOutDir,
    findPackageRoot,
    findTsConfig,
    markdownSlug,
    prepareOutDir,
} from "./paths.ts";
import { type FileReport, printFileReport, totalFailures } from "./report.ts";
import { type RunFailure, runPairs } from "./run.ts";

/**
 * Register process-level handlers that remove any leftover
 * `.literate-typescript-*` output directories when the process is interrupted
 * (Ctrl-C / SIGTERM) or exits. The per-file `finally` in {@link main} handles
 * the normal and thrown-error paths; these handlers cover signals and abnormal
 * exits, where `finally` never runs.
 */
function registerCleanupHandlers(): void {
    // Synchronous best-effort sweep on any exit (including process.exit()).
    process.on("exit", () => {
        cleanupAllOutDirs();
    });
    for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
        process.on(signal, () => {
            cleanupAllOutDirs();
            // Re-raise with the conventional 128 + signal-number exit code so
            // callers observe a normal interrupted-process exit.
            const code = signal === "SIGINT" ? 130 : signal === "SIGTERM" ? 143 : 129;
            process.exit(code);
        });
    }
}

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
        const items = parse(text);
        const { tsSamples } = assemble(items, slug);

        const pkgRoot = findPackageRoot(mdPath);
        const tsconfigPath = findTsConfig(pkgRoot);
        const outDir = prepareOutDir(pkgRoot, slug);
        try {
            const materialised = materialise(tsSamples, outDir);
            const { diagnostics, typeFailures } = typeCheck(materialised, tsconfigPath, mdPathRaw);

            // Only attempt to run if type-checking passed; running broken samples
            // produces noisier failures.
            let runFailures: RunFailure[] = [];
            if (diagnostics.length === 0 && typeFailures.length === 0) {
                runFailures = await runPairs(materialised, pkgRoot, tsconfigPath);
            }

            const runCount = countRunnable(materialised);

            const report: FileReport = {
                mdPath: mdPathRaw,
                sampleCount: tsSamples.length,
                runCount,
                diagnostics,
                typeFailures,
                runFailures,
            };
            reports.push(report);
            printFileReport(report);
        } finally {
            cleanupOutDir(outDir);
        }
    }

    const total = totalFailures(reports);
    if (total > 0) {
        process.exit(1);
    }
}

function countRunnable(files: MaterialisedSample[]): number {
    let n = 0;
    for (const m of files) {
        if (
            m.sample.typeErrors !== true &&
            (m.sample.expectedOutput !== undefined || m.sample.throws === true)
        ) {
            n += 1;
        }
    }
    return n;
}

registerCleanupHandlers();

main().catch((err: unknown) => {
    // Ensure any output directory not yet removed by a per-file `finally` is
    // cleaned before exiting on an unexpected error.
    cleanupAllOutDirs();
    if (err instanceof Error && err.stack) {
        console.error(err.stack);
    } else {
        console.error(err);
    }
    process.exit(1);
});
