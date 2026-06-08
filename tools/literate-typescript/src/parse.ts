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

export type SampleItem = {
    kind: "sample";
    id: string;
    language: "ts" | null;
    content: string;
    /** 1-based line of first content line. */
    mdLine: number;
};

export type DirectiveItem = {
    kind: "directive";
    directive: string;
};

export type ParsedItem = SampleItem | DirectiveItem;

export function parse(text: string, slug: string): ParsedItem[] {
    const lines = text.split("\n");
    const items: ParsedItem[] = [];
    let pendingId: string | null = null;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i] as string;

        const idMatch = ID_RE.exec(line);
        if (idMatch) {
            pendingId = idMatch[1] as string;
            continue;
        }

        const directiveMatch = DIRECTIVE_RE.exec(line);
        if (directiveMatch) {
            items.push({ kind: "directive", directive: directiveMatch[1] as string });
            continue;
        }

        const fenceMatch = FENCE_OPEN_RE.exec(line);
        if (fenceMatch) {
            const fenceMarker = fenceMatch[1] as string;
            const language = fenceMatch[2] || null;
            const bodyStart = i + 1;
            let j = bodyStart;
            for (; j < lines.length; j++) {
                const ln = lines[j] as string;
                if (ln.startsWith(fenceMarker) && /^`+\s*$/.test(ln)) {
                    break;
                }
            }
            const content = lines.slice(bodyStart, j).join("\n");
            const id = pendingId ?? `${slug}-${i + 1}`;
            pendingId = null;
            const normalisedLanguage: "ts" | null = language === "ts" ? "ts" : null;
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
