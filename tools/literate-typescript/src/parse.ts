/**
 * Parse a `.lts.md` Markdown file into an ordered list of fenced code blocks
 * and directives.
 *
 * Each fence carries:
 *   - language: 'ts' for type-checked/executed samples; null for free-form fences
 *     (treated as expected output of the preceding ts sample, if any).
 *   - content: raw text of the fence body (no fence delimiters).
 *   - mdLine: 1-based line number in the markdown of the first line of fence body.
 *
 * Directives are emitted as ordered events; the assembler walks fences and
 * directives together.
 *
 * Recognised comment forms:
 *   <!-- verifier:reset -->
 *
 * Anything else is treated as prose.
 */

const DIRECTIVE_RE = /^<!--\s*verifier:([a-z0-9-]+)\s*-->\s*$/;
const FENCE_OPEN_RE = /^(```+)([a-zA-Z0-9_-]*)\s*$/;

export type FenceItem = {
    kind: "fence";
    language: "ts" | null;
    content: string;
    /** 1-based line of first content line. */
    mdLine: number;
};

export type DirectiveItem = {
    kind: "directive";
    directive: string;
};

export type ParsedItem = FenceItem | DirectiveItem;

export function parse(text: string): ParsedItem[] {
    const lines = text.split("\n");
    const items: ParsedItem[] = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i] as string;

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
            const normalisedLanguage: "ts" | null = language === "ts" ? "ts" : null;
            items.push({
                kind: "fence",
                language: normalisedLanguage,
                content,
                mdLine: bodyStart + 1, // 1-based
            });
            i = j; // skip past closing fence
        }
    }

    return items;
}
