/**
 * Parse a `.lts.md` Markdown file into a list of raw samples.
 *
 * Each sample carries:
 *   - id: explicit `<!-- #id -->` or an auto-generated slug-line id.
 *   - language: 'ts' for type-checked/executed samples; null for free-form fences
 *     (used as -output bodies).
 *   - content: raw text of the fence body (no fence delimiters).
 *   - mdLine: 1-based line number in the markdown of the first line of fence body.
 *   - directive: one of 'prepend-to-following', 'reset', or null. Directives are
 *     emitted as ordered events; the assembler walks samples and directive events
 *     together.
 *
 * Recognised comment forms:
 *   <!-- #id -->
 *   <!-- verifier:prepend-to-following -->
 *   <!-- verifier:reset -->
 *
 * Anything else is treated as prose.
 */

const ID_RE = /^<!--\s*#([^\s]+)\s*-->\s*$/;
const DIRECTIVE_RE = /^<!--\s*verifier:([a-z0-9-]+)\s*-->\s*$/;
const FENCE_OPEN_RE = /^(```+)([a-zA-Z0-9_-]*)\s*$/;

/**
 * @typedef {Object} ParsedItem
 * @property {'sample' | 'directive'} kind
 * @property {string=} id            (sample)
 * @property {string|null=} language (sample) 'ts' or null
 * @property {string=} content       (sample)
 * @property {number=} mdLine        (sample) 1-based line of first content line
 * @property {string=} directive     (directive) e.g. 'prepend-to-following'
 */

/**
 * @param {string} text
 * @param {string} slug
 * @returns {ParsedItem[]}
 */
export function parse(text, slug) {
    const lines = text.split("\n");
    /** @type {ParsedItem[]} */
    const items = [];
    /** @type {string|null} */
    let pendingId = null;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        const idMatch = ID_RE.exec(line);
        if (idMatch) {
            pendingId = idMatch[1];
            continue;
        }

        const directiveMatch = DIRECTIVE_RE.exec(line);
        if (directiveMatch) {
            items.push({ kind: "directive", directive: directiveMatch[1] });
            continue;
        }

        const fenceMatch = FENCE_OPEN_RE.exec(line);
        if (fenceMatch) {
            const fenceMarker = fenceMatch[1];
            const language = fenceMatch[2] || null;
            const bodyStart = i + 1;
            let j = bodyStart;
            for (; j < lines.length; j++) {
                if (lines[j].startsWith(fenceMarker) && /^`+\s*$/.test(lines[j])) {
                    break;
                }
            }
            const content = lines.slice(bodyStart, j).join("\n");
            const id = pendingId ?? `${slug}-${i + 1}`;
            pendingId = null;
            const normalisedLanguage = language === "ts" ? "ts" : null;
            items.push({
                kind: "sample",
                id,
                language: normalisedLanguage,
                content,
                mdLine: bodyStart + 1, // 1-based
            });
            i = j; // skip past closing fence
            continue;
        }

        // Any blank/prose line clears a pending id only if no fence appears soon.
        // To keep semantics simple: ids persist only until the next fence; intervening
        // prose between an id comment and its fence is allowed.
    }

    return items;
}
