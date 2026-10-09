import type { DocumentSnapshot } from "../document-store";
import { parseModelDocument, type ParsedModelNotebook } from "./parsed-document";

const parsed = new WeakMap<DocumentSnapshot, ReturnType<typeof parseModelDocument>>();
const generatorIndexes = new WeakMap<ParsedModelNotebook, ReadonlyMap<string, string>>();

/** Generator IDs and cell IDs are distinct. Preserve the first match in notebook
 * order for duplicate generator IDs; their validity remains a semantic concern. */
export function findModelReferenceCellId(
    notebook: ParsedModelNotebook,
    kind: "object" | "morphism",
    id: string,
): string | undefined {
    let index = generatorIndexes.get(notebook);
    if (index === undefined) {
        const entries = new Map<string, string>();
        for (const cellId of notebook.cellOrder) {
            const cell = notebook.cellContents[cellId]!;
            if (
                cell.tag === "formal" &&
                (cell.content.tag === "object" || cell.content.tag === "morphism")
            ) {
                const key = `${cell.content.tag}:${cell.content.id}`;
                if (!entries.has(key)) {
                    entries.set(key, cellId);
                }
            }
        }
        index = entries;
        generatorIndexes.set(notebook, index);
    }
    return index.get(`${kind}:${id}`);
}

/** Snapshot identity determines validity; no subscription or owner is needed. */
export function parseModelSnapshot(
    snapshot: DocumentSnapshot,
): ReturnType<typeof parseModelDocument> {
    let result = parsed.get(snapshot);
    if (result === undefined) {
        result = parseModelDocument(snapshot.document);
        // Freeze newly repaired containers too; snapshot children are already frozen.
        function freeze(value: unknown): void {
            if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
                for (const child of Object.values(value)) {
                    freeze(child);
                }
                Object.freeze(value);
            }
        }
        freeze(result);
        parsed.set(snapshot, result);
    }
    return result;
}
