/**
 * Walk the parsed item stream, applying directives to produce two artefacts:
 *
 *   - tsSamples: the materialisable `ts` samples, each with its full assembled
 *     content (prepends concatenated above the sample body) and the line-offset
 *     mapping needed to translate assembled-file line numbers back to the
 *     original markdown.
 *   - outputBodies: a map from `<id>-output` → expected stdout text.
 *
 * Directives:
 *   prepend-to-following: the next sample becomes part of the active prepend
 *     stack and is concatenated above every subsequent ts sample (until reset).
 *   reset: empties the prepend stack.
 */

/**
 * @typedef {import('./parse.mjs').ParsedItem} ParsedItem
 */

/**
 * @typedef {Object} TsSample
 * @property {string} id
 * @property {string} content       Assembled (prepends + body), each section separated by '\n'.
 * @property {number} mdLine        1-based line of the body's first line in the markdown.
 * @property {number} bodyOffset    Number of assembled lines that come BEFORE the body
 *                                  (i.e. lines contributed by prepends, plus their separator
 *                                  newlines). Used to map assembled-line → mdLine.
 */

/**
 * @typedef {Object} Assembled
 * @property {TsSample[]} tsSamples
 * @property {Map<string, string>} outputBodies     id-output → expected stdout text
 */

/**
 * @param {ParsedItem[]} items
 * @returns {Assembled}
 */
export function assemble(items) {
    /** @type {TsSample[]} */
    const tsSamples = [];
    /** @type {Map<string, string>} */
    const outputBodies = new Map();

    /** @type {string[]} */
    let prependStack = [];
    let prependNext = false;

    for (const item of items) {
        if (item.kind === "directive") {
            if (item.directive === "reset") {
                prependStack = [];
                prependNext = false;
            } else if (item.directive === "prepend-to-following") {
                prependNext = true;
            } else {
                // Unknown directive — silently ignore so future additions are non-fatal.
            }
            continue;
        }

        // item.kind === "sample"
        if (item.language !== "ts") {
            // Treat as -output body if id ends with -output.
            if (item.id.endsWith("-output")) {
                outputBodies.set(item.id, item.content);
            }
            continue;
        }

        const prependParts = prependStack.slice();
        const assembled =
            prependParts.length === 0
                ? item.content
                : prependParts.join("\n") + "\n" + item.content;
        // Number of lines the prepend block contributes before the body begins.
        // Each prepend part is followed by a '\n' that introduces the next part or
        // the body. The body's first line in the assembled file is at index = total
        // newlines added by prepends (counted across parts and their joiners).
        let bodyOffset = 0;
        if (prependParts.length > 0) {
            for (const part of prependParts) {
                bodyOffset += part.split("\n").length;
            }
        }

        tsSamples.push({
            id: item.id,
            content: assembled,
            mdLine: item.mdLine,
            bodyOffset,
        });

        if (prependNext) {
            prependStack = prependStack.concat([item.content]);
            prependNext = false;
        }
    }

    return { tsSamples, outputBodies };
}
