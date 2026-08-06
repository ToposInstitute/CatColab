/**
 * Format check + run results for the console.
 */

/* eslint-disable no-console */

import type { CheckDiagnostic, TypeErrorExpectationFailure } from "./check.ts";
import type { RunFailure } from "./run.ts";

export type FileReport = {
    mdPath: string;
    sampleCount: number;
    runCount: number;
    diagnostics: CheckDiagnostic[];
    typeFailures: TypeErrorExpectationFailure[];
    runFailures: RunFailure[];
};

export function printFileReport(report: FileReport): void {
    const { mdPath, sampleCount, runCount, diagnostics, typeFailures, runFailures } = report;
    const failed = diagnostics.length + typeFailures.length + runFailures.length;

    if (failed === 0) {
        console.log(
            `\u2713 ${mdPath}  (${sampleCount} sample${sampleCount === 1 ? "" : "s"}` +
                (runCount > 0 ? `, ${runCount} executed` : "") +
                ")",
        );
        return;
    }

    console.log(
        `\u2717 ${mdPath}  (${diagnostics.length} type error${diagnostics.length === 1 ? "" : "s"}, ` +
            `${typeFailures.length} type expectation failure${typeFailures.length === 1 ? "" : "s"}, ` +
            `${runFailures.length} run failure${runFailures.length === 1 ? "" : "s"})`,
    );
    for (const d of diagnostics) {
        const loc =
            d.mdLine > 0 ? `${d.mdPath}:${d.mdLine}${d.column ? `:${d.column}` : ""}` : d.mdPath;
        console.log(`  [${d.sampleId}] ${loc}: ${d.message}`);
    }
    for (const f of typeFailures) {
        printExpectedActual(f.sampleId, f.reason, f.expected, f.actual);
    }
    for (const f of runFailures) {
        printExpectedActual(f.sampleId, f.reason, f.expected, f.actual);
        if (f.stderr) {
            console.log("    stderr:");
            for (const line of f.stderr.split("\n")) {
                console.log(`      ${line}`);
            }
        }
    }
}

function printExpectedActual(
    sampleId: string,
    reason: string,
    expected?: string,
    actual?: string,
): void {
    console.log(`  [${sampleId}] ${reason}`);
    if (expected === undefined || actual === undefined) {
        return;
    }
    console.log("    expected:");
    for (const line of expected.split("\n")) {
        console.log(`      ${line}`);
    }
    console.log("    actual:");
    for (const line of actual.split("\n")) {
        console.log(`      ${line}`);
    }
}

/**
 * @returns Total failure count.
 */
export function totalFailures(reports: FileReport[]): number {
    let n = 0;
    for (const r of reports) {
        n += r.diagnostics.length + r.typeFailures.length + r.runFailures.length;
    }
    return n;
}
