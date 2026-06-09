/**
 * Execute samples that carry an expected-output body via `tsx` and compare
 * stdout against the expected text.
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { delimiter, join } from "node:path";

import { stripAnsi } from "./ansi.ts";
import type { MaterialisedSample } from "./check.ts";

export type RunFailure = {
    sampleId: string;
    /** Human-readable failure reason. */
    reason: string;
    expected?: string;
    actual?: string;
    stderr?: string;
    exitCode?: number;
};

/**
 * Normalise output for comparison: strip ANSI, then trim trailing whitespace
 * on each line, then trim trailing blank lines.
 */
export function normalise(s: string): string {
    const stripped = stripAnsi(s);
    const lines = stripped.split("\n").map((line) => line.replace(/[ \t]+$/g, ""));
    while (lines.length > 0 && lines[lines.length - 1] === "") {
        lines.pop();
    }
    return lines.join("\n");
}

/**
 * Resolve a `tsx` binary. Relies on tsx being a workspace dep of the consuming
 * package (or hoisted by pnpm), so the spawn from `pkgRoot` finds it via
 * `node_modules/.bin/tsx` on PATH.
 */
function resolveTsxBin(): string {
    return "tsx";
}

/**
 * Spawn tsx with the given file and capture stdio.
 */
function runOne(
    filePath: string,
    cwd: string,
    tsconfigPath: string,
): Promise<{ stdout: string; stderr: string; code: number }> {
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
        proc.stdout.on("data", (chunk: Buffer) => {
            stdout += chunk.toString();
        });
        proc.stderr.on("data", (chunk: Buffer) => {
            stderr += chunk.toString();
        });
        proc.on("error", reject);
        proc.on("close", (code) => {
            resolve({ stdout, stderr, code: code ?? 1 });
        });
    });
}

/**
 * For each materialised sample carrying an `expectedOutput`, run the sample
 * with tsx and compare stdout. Returns a list of failures (empty on success).
 */
export async function runPairs(
    files: MaterialisedSample[],
    pkgRoot: string,
    tsconfigPath: string,
): Promise<RunFailure[]> {
    const failures: RunFailure[] = [];
    for (const m of files) {
        const expected = m.sample.expectedOutput;
        if (expected === undefined) {
            continue;
        }

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
