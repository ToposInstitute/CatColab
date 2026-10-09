import type { ModelJudgment, Notebook as StoredNotebook } from "catcolab-document-types";
import type { DeepReadonly } from "../document-store";
import {
    isRecord,
    structuralIssue as issue,
    type StructuralIssue,
    type WithIssues,
} from "../parsed-document";
import type { Result } from "../result";

/** Structural parsing only: theory support and reference validity belong to validation. */
declare const parsed: unique symbol;
export type ParsedModelNotebook = DeepReadonly<StoredNotebook<ModelJudgment>> & {
    readonly [parsed]: true;
};

export interface ParsedModelDocument {
    readonly type: "model";
    readonly name: string;
    readonly theory: string;
    readonly notebook: ParsedModelNotebook;
}

type Path = ReadonlyArray<PropertyKey>;
type Check = (value: unknown, path: Path, issues: StructuralIssue[]) => boolean;

function scalar(predicate: (value: unknown) => boolean, description: string): Check {
    return (value, path, issues) => {
        if (predicate(value)) {
            return true;
        }
        issues.push(issue(`Expected ${description}`, path));
        return false;
    };
}
const string = scalar((value) => typeof value === "string", "a string");
const uuid = scalar(
    (value) =>
        typeof value === "string" &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value),
    "a UUID",
);
const record = scalar(isRecord, "an object");
const modality = scalar(
    (value) =>
        typeof value === "string" &&
        [
            "Discrete",
            "Codiscrete",
            "List",
            "SymmetricList",
            "CocartesianList",
            "CartesianList",
            "AdditiveList",
        ].includes(value),
    "a modality",
);

function nullable(check: Check): Check {
    return (value, path, issues) => value === null || check(value, path, issues);
}
function array(check: Check): Check {
    return (value, path, issues) => {
        if (!Array.isArray(value)) {
            issues.push(issue("Expected an array", path));
            return false;
        }
        // Check every entry, even after a failure, to report all structural damage.
        return Array.from(value, (entry, index) => check(entry, [...path, index], issues)).every(
            Boolean,
        );
    };
}
function fields(schema: Record<string, Check>): Check {
    return (value, path, issues) => {
        if (!isRecord(value)) {
            issues.push(issue("Expected an object", path));
            return false;
        }
        return Object.entries(schema)
            .map(([key, check]) => check(value[key], [...path, key], issues))
            .every(Boolean);
    };
}
function tagged(variants: Record<string, Check>): Check {
    return (value, path, issues) => {
        // Stored JSON is acyclic, but callers may pass arbitrary JS values.
        // Bound nesting so cyclic or adversarially deep expressions cannot overflow.
        if (path.length > 256) {
            issues.push(issue("Expression nesting is too deep", path));
            return false;
        }
        if (!isRecord(value)) {
            issues.push(issue("Expected a tagged expression", path));
            return false;
        }
        const check =
            typeof value["tag"] === "string" && Object.hasOwn(variants, value["tag"])
                ? variants[value["tag"]]
                : undefined;
        if (!check) {
            issues.push(issue("Unknown expression tag", [...path, "tag"]));
            return false;
        }
        return check(value["content"], [...path, "content"], issues);
    };
}

// Lazy functions allow the mutually recursive stored expression types.
const obType: Check = (value, path, issues) =>
    tagged({
        Basic: string,
        Tabulator: morType,
        ModeApp: fields({ modality, obType }),
    })(value, path, issues);
const morType: Check = (value, path, issues) =>
    tagged({
        Basic: string,
        Hom: obType,
        Composite: array(morType),
        ModeApp: fields({ modality, morType }),
    })(value, path, issues);
const ob: Check = (value, path, issues) =>
    tagged({
        Basic: string,
        App: fields({ op: tagged({ Basic: string }), ob }),
        List: fields({ modality, objects: array(nullable(ob)) }),
        Tabulated: mor,
    })(value, path, issues);
const mor: Check = (value, path, issues) =>
    tagged({
        Basic: string,
        Composite: tagged({ Id: ob, Seq: array(mor) }),
        TabulatorSquare: fields({ dom: mor, cod: mor, pre: mor, post: mor }),
    })(value, path, issues);
const link = fields({
    _id: string,
    _version: nullable(string),
    _server: string,
    type: scalar((value) => value === "instantiation", "an instantiation link"),
});
const judgment: Check = (value, path, issues) => {
    if (!isRecord(value)) {
        issues.push(issue("Expected a model judgment", path));
        return false;
    }
    const variants: Record<string, Check> = {
        object: fields({ id: uuid, name: string, obType }),
        morphism: fields({ id: uuid, name: string, morType, dom: nullable(ob), cod: nullable(ob) }),
        equation: fields({ id: uuid, name: string, lhs: nullable(mor), rhs: nullable(mor) }),
        instantiation: fields({
            id: uuid,
            name: string,
            model: nullable(link),
            specializations: array(fields({ id: nullable(string), ob: nullable(ob) })),
        }),
    };
    const check =
        typeof value["tag"] === "string" && Object.hasOwn(variants, value["tag"])
            ? variants[value["tag"]]
            : undefined;
    if (!check) {
        issues.push(issue("Unknown model judgment tag", [...path, "tag"]));
        return false;
    }
    return check(value, path, issues);
};
const richText: Check = (value, path, issues) => {
    if (typeof value === "string") {
        return true;
    }
    return array((span, spanPath, spanIssues) => {
        if (!isRecord(span)) {
            spanIssues.push(issue("Expected a rich-text span", spanPath));
            return false;
        }
        switch (span["type"]) {
            case "text":
                return fields({
                    value: string,
                    ...(span["marks"] === undefined ? {} : { marks: record }),
                })(span, spanPath, spanIssues);
            case "block":
                return fields({ block: record })(span, spanPath, spanIssues);
            default:
                spanIssues.push(issue("Unknown rich-text span type", [...spanPath, "type"]));
                return false;
        }
    })(value, path, issues);
};

/** Repair notebook structure without changing the stored JSON. The returned
 * order contains exactly the retained cell keys, once each. Malformed cells
 * are dropped; the map key is authoritative for each cell's ID. Extra fields
 * are retained. An undamaged notebook is returned by identity. */
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
        if (!uuid(id, cellPath, issues)) {
            continue;
        }
        if (!isRecord(cell)) {
            issues.push(issue("Expected a notebook cell", cellPath));
            continue;
        }
        const check =
            cell["tag"] === "rich-text"
                ? richText
                : cell["tag"] === "formal"
                  ? judgment
                  : undefined;
        if (!check) {
            issues.push(issue("Unknown notebook cell tag", [...cellPath, "tag"]));
            continue;
        }
        if (!check(cell["content"], [...cellPath, "content"], issues)) {
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
