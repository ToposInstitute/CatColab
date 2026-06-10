/**
 * Type-check materialised samples using the consuming package's TypeScript
 * configuration. Diagnostics are mapped back to original markdown line numbers
 * via each sample's `bodyOffset`.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import ts from "typescript";

import type { TsSample } from "./assemble.ts";

export type MaterialisedSample = {
    sample: TsSample;
    /** Absolute path to the written .ts file. */
    filePath: string;
};

export type CheckDiagnostic = {
    sampleId: string;
    mdPath: string;
    /** 1-based line in the original markdown, or 0 when not attributable to a sample. */
    mdLine: number;
    /** 1-based column in the original line. */
    column?: number;
    message: string;
};

export type CheckResult = {
    ok: boolean;
    diagnostics: CheckDiagnostic[];
};

/**
 * Write each assembled sample to disk under `outDir`.
 */
export function materialise(samples: TsSample[], outDir: string): MaterialisedSample[] {
    const out: MaterialisedSample[] = [];
    for (const sample of samples) {
        const filePath = join(outDir, `${sample.id}.${sample.language}`);
        // Append a trailing newline so TypeScript line counts match what editors show.
        writeFileSync(filePath, sample.content + "\n", "utf8");
        out.push({ sample, filePath });
    }
    return out;
}

/**
 * Parse `tsconfig.json` into compiler options + base directory.
 */
function loadTsConfig(tsconfigPath: string): {
    options: ts.CompilerOptions;
    baseDir: string;
} {
    const text = readFileSync(tsconfigPath, "utf8");
    const parsed = ts.parseConfigFileTextToJson(tsconfigPath, text);
    if (parsed.error) {
        throw new Error(
            `Failed to parse ${tsconfigPath}: ${ts.flattenDiagnosticMessageText(parsed.error.messageText, "\n")}`,
        );
    }
    const baseDir = dirname(tsconfigPath);
    const result = ts.parseJsonConfigFileContent(
        parsed.config,
        ts.sys,
        baseDir,
        undefined,
        tsconfigPath,
    );
    if (result.errors && result.errors.length > 0) {
        const msg = result.errors
            .map((e) => ts.flattenDiagnosticMessageText(e.messageText, "\n"))
            .join("\n");
        throw new Error(`Errors loading ${tsconfigPath}:\n${msg}`);
    }
    return { options: result.options, baseDir };
}

/**
 * Run a single ts.Program over the materialised files and return diagnostics
 * mapped back to the original markdown.
 */
export function typeCheck(
    files: MaterialisedSample[],
    tsconfigPath: string,
    mdPath: string,
): CheckResult {
    const { options } = loadTsConfig(tsconfigPath);

    // Force noEmit, never write JS for samples.
    options.noEmit = true;

    // Build a lookup from absolute file path to sample for line mapping.
    const byPath = new Map<string, TsSample>();
    for (const m of files) {
        byPath.set(m.filePath, m.sample);
    }

    const rootNames = files.map((f) => f.filePath);
    const program = ts.createProgram({
        rootNames,
        options,
    });

    const allDiagnostics = ts.getPreEmitDiagnostics(program);
    const diagnostics: CheckDiagnostic[] = [];

    for (const diag of allDiagnostics) {
        const message = ts.flattenDiagnosticMessageText(diag.messageText, "\n");
        if (!diag.file) {
            diagnostics.push({
                sampleId: "(global)",
                mdPath,
                mdLine: 0,
                message,
            });
            continue;
        }
        const sample = byPath.get(diag.file.fileName);
        if (!sample) {
            // Diagnostic about a library/node_modules file or something we didn't
            // produce — surface it without md mapping.
            const pos = diag.start ?? 0;
            const { line, character } = diag.file.getLineAndCharacterOfPosition(pos);
            diagnostics.push({
                sampleId: "(external)",
                mdPath: diag.file.fileName,
                mdLine: line + 1,
                column: character + 1,
                message,
            });
            continue;
        }
        const pos = diag.start ?? 0;
        const { line, character } = diag.file.getLineAndCharacterOfPosition(pos);
        // line is 0-based assembled-file line. Lines [0, sample.bodyOffset) belong
        // to prepends. Lines >= bodyOffset are part of the body proper.
        let mdLine: number;
        if (line < sample.bodyOffset) {
            // Diagnostic falls inside a prepend. Best-effort: report the body's
            // first line (TS will repeat as user fixes the upstream sample).
            mdLine = sample.mdLine;
        } else {
            const bodyLine = line - sample.bodyOffset; // 0-based within body
            mdLine = sample.mdLine + bodyLine;
        }
        diagnostics.push({
            sampleId: sample.id,
            mdPath,
            mdLine,
            column: character + 1,
            message,
        });
    }

    return { ok: diagnostics.length === 0, diagnostics };
}
