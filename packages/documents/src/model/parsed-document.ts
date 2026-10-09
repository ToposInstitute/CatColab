import type { DeepReadonly } from "../document-store";
import {
    isRecord,
    structuralIssue as issue,
    type StructuralIssue,
    type WithIssues,
} from "../parsed-document";
import type { Result } from "../result";

/** Only the envelope is checked; payloads belong to Wasm deserialization and validation. */
export interface ParsedModelJudgment extends Readonly<Record<string, unknown>> {
    readonly tag: "object" | "morphism" | "equation" | "instantiation";
    readonly id: string;
    readonly name: string;
}
export type ParsedModelCell =
    | { readonly tag: "formal"; readonly id: string; readonly content: ParsedModelJudgment }
    | { readonly tag: "rich-text"; readonly id: string; readonly content: unknown };

export interface ParsedModelNotebook {
    readonly cellContents: Readonly<Record<string, DeepReadonly<ParsedModelCell>>>;
    readonly cellOrder: readonly string[];
}

export interface ParsedModelDocument {
    readonly type: "model";
    readonly name: string;
    readonly theory: string;
    readonly notebook: ParsedModelNotebook;
}

type Path = ReadonlyArray<PropertyKey>;
function string(value: unknown, path: Path, issues: StructuralIssue[]): boolean {
    if (typeof value === "string") {
        return true;
    }
    issues.push(issue("Expected a string", path));
    return false;
}

function judgment(value: unknown, path: Path, issues: StructuralIssue[]): boolean {
    if (!isRecord(value)) {
        issues.push(issue("Expected a model judgment", path));
        return false;
    }
    if (
        typeof value["tag"] !== "string" ||
        !["object", "morphism", "equation", "instantiation"].includes(value["tag"])
    ) {
        issues.push(issue("Unknown model judgment tag", [...path, "tag"]));
        return false;
    }
    const id = string(value["id"], [...path, "id"], issues);
    const name = string(value["name"], [...path, "name"], issues);
    return id && name;
}

/** Repair notebook structure without changing the stored JSON. The returned
 * order contains exactly the retained cell keys, once each. Malformed cell envelopes
 * are dropped; the map key is authoritative for each cell's ID. Extra fields
 * are retained. An undamaged notebook is returned with the same object identity. */
export function parseModelNotebook(value: unknown): WithIssues<ParsedModelNotebook> {
    const issues: StructuralIssue[] = [];
    const path = ["notebook"];
    const notebook = isRecord(value) ? value : {};
    if (!isRecord(value)) {
        issues.push(issue("A model document must have a notebook", path));
    }
    const rawContents = notebook["cellContents"];
    const contents = isRecord(rawContents) ? rawContents : {};
    if (!isRecord(rawContents) && isRecord(value)) {
        issues.push(issue("A notebook must have cell contents", [...path, "cellContents"]));
    }
    const kept: Record<string, unknown> = Object.create(null);
    for (const [id, cell] of Object.entries(contents)) {
        const cellPath = [...path, "cellContents", id];
        if (!isRecord(cell)) {
            issues.push(issue("Expected a notebook cell", cellPath));
            continue;
        }
        if (cell["tag"] !== "rich-text" && cell["tag"] !== "formal") {
            issues.push(issue("Unknown notebook cell tag", [...cellPath, "tag"]));
            continue;
        }
        if (
            cell["tag"] === "formal" &&
            !judgment(cell["content"], [...cellPath, "content"], issues)
        ) {
            continue;
        }
        if (cell["id"] !== id) {
            issues.push(issue("Cell ID must match its contents key", [...cellPath, "id"]));
            kept[id] = { ...cell, id };
        } else {
            kept[id] = cell;
        }
    }
    const order: string[] = [];
    const seen = new Set<string>();
    const rawOrder = notebook["cellOrder"];
    if (!Array.isArray(rawOrder)) {
        if (isRecord(value)) {
            issues.push(issue("A notebook must have a cell order", [...path, "cellOrder"]));
        }
    } else {
        for (const [index, id] of rawOrder.entries()) {
            const entryPath = [...path, "cellOrder", index];
            if (typeof id !== "string") {
                issues.push(issue("Cell IDs must be strings", entryPath));
            } else if (!Object.hasOwn(contents, id)) {
                issues.push(issue(`Cell \`${id}\` is ordered but has no contents`, entryPath));
            } else if (seen.has(id)) {
                issues.push(issue(`Cell \`${id}\` is ordered more than once`, entryPath));
            } else {
                seen.add(id);
                if (Object.hasOwn(kept, id)) {
                    order.push(id);
                }
            }
        }
    }
    for (const id of Object.keys(kept)) {
        if (!seen.has(id)) {
            if (Array.isArray(rawOrder)) {
                issues.push(
                    issue(`Cell \`${id}\` is missing from the cell order`, [
                        ...path,
                        "cellContents",
                        id,
                    ]),
                );
            }
            order.push(id);
        }
    }
    const repaired =
        issues.length === 0 ? value : { ...notebook, cellContents: kept, cellOrder: order };
    return { value: repaired as ParsedModelNotebook, issues };
}

/** Fatal metadata errors fail parsing; repairable notebook damage is reported
 * alongside a usable read value. All issue paths are document-root relative. */
export function parseModelDocument(
    document: unknown,
): Result<WithIssues<ParsedModelDocument>, ReadonlyArray<StructuralIssue>> {
    if (!isRecord(document)) {
        return { tag: "Err", content: [issue("A document must be an object", [])] };
    }
    if (document["type"] !== "model") {
        return { tag: "Err", content: [issue('Expected a document of type "model"', ["type"])] };
    }
    const fatal: StructuralIssue[] = [];
    string(document["name"], ["name"], fatal);
    string(document["theory"], ["theory"], fatal);
    if (fatal.length > 0) {
        return { tag: "Err", content: fatal };
    }
    const notebook = parseModelNotebook(document["notebook"]);
    return {
        tag: "Ok",
        content: {
            value: {
                type: "model",
                name: document["name"] as string,
                theory: document["theory"] as string,
                notebook: notebook.value,
            },
            issues: notebook.issues,
        },
    };
}
