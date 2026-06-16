/**
 * Walk the parsed item stream and produce the list of materialisable `ts`/`tsx`
 * samples.
 *
 * Semantics:
 *   - `<!-- verifier:prepend-to-following -->` marks the next code fence as a
 *     prelude: it is added to the active prepend stack and concatenated above
 *     every subsequent code fence (in addition to being a sample itself).
 *   - Code fences without that directive are standalone samples (they still
 *     see the existing prepend stack, but do not themselves get added to it).
 *   - A non-code fence immediately following a code fence is treated as that
 *     sample's expected stdout.
 *   - `<!-- verifier:throws -->` marks the next code fence as expected to throw
 *     at runtime: the sample must exit non-zero, and a following non-code fence
 *     is matched as a substring of the runtime error output (stderr) instead of
 *     stdout.
 *   - `<!-- verifier:typescript-errors -->` marks the next code fence as
 *     expected to fail type-checking: a following non-code fence is compared
 *     against the exact TypeScript diagnostic text for that sample.
 *   - `<!-- verifier:reset -->` clears the prepend stack so the next code
 *     fence starts fresh.
 *   - A sample is `tsx` if its body or any active prepend is a `tsx` fence;
 *     `tsx` samples are written with a `.tsx` extension and are compiled with
 *     babel-preset-solid before execution.
 *
 * Each sample also carries the line-offset mapping needed to translate
 * assembled-file line numbers back to the original markdown.
 */

import type { ParsedItem, SampleLanguage } from "./parse.ts";

export type TsSample = {
    id: string;
    /** 'ts' or 'tsx'; tsx if the body or any prepend is tsx. */
    language: SampleLanguage;
    /** Assembled (prepends + body), each section separated by '\n'. */
    content: string;
    /** 1-based line of the body's first line in the markdown. */
    mdLine: number;
    /**
     * Number of assembled lines that come BEFORE the body (i.e. lines contributed by
     * prepends, plus their separator newlines). Used to map assembled-line → mdLine.
     */
    bodyOffset: number;
    /** Expected stdout, if the sample is followed by a non-code fence. */
    expectedOutput?: string;
    /**
     * Whether the sample is expected to throw at runtime. If set,
     * `expectedOutput` is matched as a substring of stderr instead of stdout.
     */
    throws?: boolean;
    /** Whether this sample is expected to fail TypeScript type-checking. */
    typeErrors?: boolean;
};

export type Assembled = {
    tsSamples: TsSample[];
};

type PrependPart = {
    content: string;
    language: SampleLanguage;
};

export function assemble(items: ParsedItem[], slug: string): Assembled {
    const tsSamples: TsSample[] = [];

    let prependStack: PrependPart[] = [];
    let prependNext = false;
    let throwsNext = false;
    let typeErrorsNext = false;
    let lastTsSample: TsSample | null = null;

    for (const item of items) {
        if (item.kind === "directive") {
            if (item.directive === "reset") {
                prependStack = [];
                prependNext = false;
                throwsNext = false;
                typeErrorsNext = false;
                lastTsSample = null;
            } else if (item.directive === "prepend-to-following") {
                prependNext = true;
            } else if (item.directive === "throws") {
                throwsNext = true;
            } else if (item.directive === "typescript-errors") {
                typeErrorsNext = true;
            }
            // Unknown directives are silently ignored so future additions
            // remain non-fatal.
            continue;
        }

        // item.kind === "fence"
        if (item.language === null) {
            // Non-code fence immediately after a code sample → expected output.
            if (lastTsSample !== null) {
                lastTsSample.expectedOutput = item.content;
                lastTsSample = null;
            }
            continue;
        }

        const prependParts = prependStack.slice();
        const assembled =
            prependParts.length === 0
                ? item.content
                : prependParts.map((p) => p.content).join("\n") + "\n" + item.content;
        // Number of lines the prepend block contributes before the body begins.
        let bodyOffset = 0;
        for (const part of prependParts) {
            bodyOffset += part.content.split("\n").length;
        }

        const language: SampleLanguage =
            item.language === "tsx" || prependParts.some((p) => p.language === "tsx")
                ? "tsx"
                : "ts";

        const sample: TsSample = {
            id: `${slug}-${item.mdLine}`,
            language,
            content: assembled,
            mdLine: item.mdLine,
            bodyOffset,
            ...(throwsNext ? { throws: true } : {}),
            ...(typeErrorsNext ? { typeErrors: true } : {}),
        };
        throwsNext = false;
        typeErrorsNext = false;
        tsSamples.push(sample);
        lastTsSample = sample;

        if (prependNext) {
            prependStack = prependStack.concat([
                { content: item.content, language: item.language },
            ]);
            prependNext = false;
        }
    }

    return { tsSamples };
}
