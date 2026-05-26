/**
 * Execute paired samples via `tsx` and compare stdout against the expected
 * `-output` body.
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { delimiter, join } from "node:path";
import { stripAnsi } from "./ansi.mjs";

/**
 * @typedef {import('./check.mjs').MaterialisedSample} MaterialisedSample
 */

/**
 * @typedef {Object} RunFailure
 * @property {string} sampleId
 * @property {string} reason            Human-readable failure reason.
 * @property {string=} expected
 * @property {string=} actual
 * @property {string=} stderr
 * @property {number=} exitCode
 */

/**
 * Normalise output for comparison: strip ANSI, then trim trailing whitespace
 * on each line, then trim trailing blank lines.
 *
 * @param {string} s
 */
export function normalise(s) {
    const stripped = stripAnsi(s);
    const lines = stripped.split("\n").map(line => line.replace(/[ \t]+$/g, ""));
    while (lines.length > 0 && lines[lines.length - 1] === "") {
        lines.pop();
    }
    return lines.join("\n");
}

/**
 * Resolve a `tsx` binary. Relies on tsx being a workspace dep of the consuming
 * package (or hoisted by pnpm), so the spawn from `pkgRoot` finds it via
 * `node_modules/.bin/tsx` on PATH.
 *
 * @returns {string}
 */
function resolveTsxBin() {
    return "tsx";
}

/**
 * Spawn tsx with the given file and capture stdio.
 *
 * @param {string} filePath
 * @param {string} cwd
 * @param {string} tsconfigPath
 * @returns {Promise<{ stdout: string, stderr: string, code: number }>}
 */
function runOne(filePath, cwd, tsconfigPath) {
    return new Promise((resolve, reject) => {
        // Ensure <cwd>/node_modules/.bin is on PATH so a tsx installed as a
        // (dev-)dependency of the consuming package is found, regardless of how
        // the CLI was invoked.
        const localBin = join(cwd, "node_modules", ".bin");
        const existingPath = process.env.PATH || "";
        const augmentedPath = existsSync(localBin)
            ? `${localBin}${delimiter}${existingPath}`
            : existingPath;

        // Pass `--conditions=browser --conditions=development` so packages
        // exporting different builds for node vs browser (e.g. `solid-js`)
        // resolve to their browser/dev build, where reactivity is active.
        const proc = spawn(
            resolveTsxBin(),
            [
                "--conditions=browser",
                "--conditions=development",
                "--tsconfig",
                tsconfigPath,
                filePath,
            ],
            {
                cwd,
                env: {
                    ...process.env,
                    PATH: augmentedPath,
                    FORCE_COLOR: "0",
                    NODE_DISABLE_COLORS: "1",
                    NODE_OPTIONS: "",
                },
                stdio: ["ignore", "pipe", "pipe"],
            },
        );
        let stdout = "";
        let stderr = "";
        proc.stdout.on("data", chunk => {
            stdout += chunk.toString();
        });
        proc.stderr.on("data", chunk => {
            stderr += chunk.toString();
        });
        proc.on("error", reject);
        proc.on("close", code => {
            resolve({ stdout, stderr, code: code ?? 1 });
        });
    });
}

/**
 * For each materialised sample that has a paired `<id>-output` body, run the
 * sample with tsx and compare stdout. Returns a list of failures (empty on
 * success).
 *
 * @param {MaterialisedSample[]} files
 * @param {Map<string, string>} outputBodies
 * @param {string} pkgRoot
 * @param {string} tsconfigPath
 * @returns {Promise<RunFailure[]>}
 */
export async function runPairs(files, outputBodies, pkgRoot, tsconfigPath) {
    /** @type {RunFailure[]} */
    const failures = [];
    for (const m of files) {
        const expectedKey = `${m.sample.id}-output`;
        const expected = outputBodies.get(expectedKey);
        if (expected === undefined) continue;

        const { stdout, stderr, code } = await runOne(m.filePath, pkgRoot, tsconfigPath);
        if (code !== 0) {
            failures.push({
                sampleId: m.sample.id,
                reason: `tsx exited with code ${code}`,
                exitCode: code,
                stderr,
            });
            continue;
        }
        const actual = normalise(stdout);
        const expectedNorm = normalise(expected);
        if (actual !== expectedNorm) {
            failures.push({
                sampleId: m.sample.id,
                reason: "stdout does not match expected output",
                expected: expectedNorm,
                actual,
            });
        }
    }
    return failures;
}
