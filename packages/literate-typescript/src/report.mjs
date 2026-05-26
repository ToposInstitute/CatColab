/**
 * Format check + run results for the console.
 */

/**
 * @typedef {import('./check.mjs').CheckDiagnostic} CheckDiagnostic
 * @typedef {import('./run.mjs').RunFailure} RunFailure
 */

/**
 * @typedef {Object} FileReport
 * @property {string} mdPath
 * @property {number} sampleCount
 * @property {number} runCount
 * @property {CheckDiagnostic[]} diagnostics
 * @property {RunFailure[]} runFailures
 */

/** @param {FileReport} report */
export function printFileReport(report) {
    const { mdPath, sampleCount, runCount, diagnostics, runFailures } = report;
    const failed = diagnostics.length + runFailures.length;

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
            `${runFailures.length} run failure${runFailures.length === 1 ? "" : "s"})`,
    );
    for (const d of diagnostics) {
        const loc = d.mdLine > 0 ? `${d.mdPath}:${d.mdLine}${d.column ? `:${d.column}` : ""}` : d.mdPath;
        console.log(`  [${d.sampleId}] ${loc}: ${d.message}`);
    }
    for (const f of runFailures) {
        console.log(`  [${f.sampleId}] ${f.reason}`);
        if (f.expected !== undefined && f.actual !== undefined) {
            console.log("    expected:");
            for (const line of f.expected.split("\n")) {
                console.log(`      ${line}`);
            }
            console.log("    actual:");
            for (const line of f.actual.split("\n")) {
                console.log(`      ${line}`);
            }
        }
        if (f.stderr) {
            console.log("    stderr:");
            for (const line of f.stderr.split("\n")) {
                console.log(`      ${line}`);
            }
        }
    }
}

/**
 * @param {FileReport[]} reports
 * @returns {number}    Total failure count.
 */
export function totalFailures(reports) {
    let n = 0;
    for (const r of reports) {
        n += r.diagnostics.length + r.runFailures.length;
    }
    return n;
}
