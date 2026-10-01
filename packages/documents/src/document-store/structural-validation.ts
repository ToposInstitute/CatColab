import type { Document } from "catcolab-document-types";
import type { Issue } from "../result";

/* Structural validation of the underlying JSON document.

Checks that a document is well-formed enough for the operations in this
package to work without defensive per-access checks: the discriminant and
required fields are present, notebooks are internally consistent, and stored
instance tables have the expected shape. Validation is deliberately tolerant
of extra fields and of semantic problems (those are the elaborator's job). */

type Path = ReadonlyArray<PropertyKey>;

const documentTypes: ReadonlySet<string> = new Set([
    "model",
    "diagram",
    "analysis",
    "instance",
    "llmconversation",
]);

const modelJudgmentTags: ReadonlySet<string> = new Set([
    "object",
    "morphism",
    "equation",
    "instantiation",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function issue(message: string, path: Path): Issue {
    return { message, path };
}

function validateLink(value: unknown, path: Path, issues: Issue[]): void {
    if (!isRecord(value) || typeof value["_id"] !== "string") {
        issues.push(issue("Expected a link to another document", path));
    }
}

/** Validate the content of a formal cell in a model notebook. */
function validateModelJudgment(value: Record<string, unknown>, path: Path, issues: Issue[]): void {
    if (typeof value["tag"] !== "string" || !modelJudgmentTags.has(value["tag"])) {
        issues.push(
            issue(`Unknown model judgment tag "${String(value["tag"])}"`, [...path, "tag"]),
        );
        return;
    }
    if (typeof value["id"] !== "string") {
        issues.push(issue("A model judgment must have an id", [...path, "id"]));
    }
    if (typeof value["name"] !== "string") {
        issues.push(issue("A model judgment must have a name", [...path, "name"]));
    }
}

function validateNotebook(
    value: unknown,
    path: Path,
    issues: Issue[],
    validateJudgment?: (value: Record<string, unknown>, path: Path, issues: Issue[]) => void,
): void {
    if (!isRecord(value)) {
        issues.push(issue("A notebook must be an object", path));
        return;
    }
    const cellContents = value["cellContents"];
    const cellOrder = value["cellOrder"];
    if (!isRecord(cellContents)) {
        issues.push(issue("A notebook must have cell contents", [...path, "cellContents"]));
        return;
    }
    if (!Array.isArray(cellOrder)) {
        issues.push(issue("A notebook must have a cell order", [...path, "cellOrder"]));
        return;
    }
    for (const [index, cellId] of cellOrder.entries()) {
        if (typeof cellId !== "string") {
            issues.push(issue("Cell ids must be strings", [...path, "cellOrder", index]));
            continue;
        }
        if (cellContents[cellId] === undefined) {
            issues.push(
                issue(`Cell \`${cellId}\` is listed in the cell order but has no contents`, [
                    ...path,
                    "cellOrder",
                    index,
                ]),
            );
        }
    }
    for (const [cellId, cell] of Object.entries(cellContents)) {
        const cellPath = [...path, "cellContents", cellId];
        if (!isRecord(cell) || typeof cell["id"] !== "string") {
            issues.push(issue(`Cell \`${cellId}\` is not a well-formed cell`, cellPath));
            continue;
        }
        if (cell["tag"] === "rich-text") {
            if (cell["content"] === undefined) {
                issues.push(
                    issue(`Rich text cell \`${cellId}\` has no content`, [...cellPath, "content"]),
                );
            }
        } else if (cell["tag"] === "formal") {
            if (!isRecord(cell["content"])) {
                issues.push(
                    issue(`Formal cell \`${cellId}\` has no content`, [...cellPath, "content"]),
                );
                continue;
            }
            validateJudgment?.(cell["content"], [...cellPath, "content"], issues);
        } else {
            issues.push(
                issue(`Cell \`${cellId}\` has unknown tag "${String(cell["tag"])}"`, [
                    ...cellPath,
                    "tag",
                ]),
            );
        }
    }
}

function validateTables(value: unknown, path: Path, issues: Issue[]): void {
    if (!isRecord(value)) {
        issues.push(issue("An instance document must have tables", path));
        return;
    }
    for (const [tableId, table] of Object.entries(value)) {
        const tablePath = [...path, tableId];
        if (!isRecord(table) || !isRecord(table["rows"])) {
            issues.push(issue(`Table \`${tableId}\` is not a well-formed table`, tablePath));
            continue;
        }
        // Legacy documents may lack a row order; readers tolerate that, so a
        // missing row order is not an issue, but a mistyped one is.
        if (table["rowOrder"] !== undefined && !Array.isArray(table["rowOrder"])) {
            issues.push(
                issue(`Table \`${tableId}\` has a malformed row order`, [...tablePath, "rowOrder"]),
            );
        }
        for (const [rowId, row] of Object.entries(table["rows"])) {
            if (!isRecord(row) || !isRecord(row["fields"])) {
                issues.push(
                    issue(`Row \`${rowId}\` of table \`${tableId}\` is not a well-formed row`, [
                        ...tablePath,
                        "rows",
                        rowId,
                    ]),
                );
            }
        }
    }
}

/** Check that a document is structurally well-formed for its type.

Returns an empty array when the document is valid. */
export function validateDocumentStructure(document: Readonly<Document>): Issue[] {
    const value: unknown = document;
    if (!isRecord(value)) {
        return [issue("A document must be an object", [])];
    }
    if (typeof value["type"] !== "string" || !documentTypes.has(value["type"])) {
        return [issue(`Unknown document type "${String(value["type"])}"`, ["type"])];
    }

    const issues: Issue[] = [];
    if (typeof value["name"] !== "string") {
        issues.push(issue("A document must have a name", ["name"]));
    }
    switch (value["type"]) {
        case "model":
            if (typeof value["theory"] !== "string") {
                issues.push(issue("A model document must have a theory", ["theory"]));
            }
            validateNotebook(value["notebook"], ["notebook"], issues, validateModelJudgment);
            break;
        case "diagram":
            validateLink(value["diagramIn"], ["diagramIn"], issues);
            validateNotebook(value["notebook"], ["notebook"], issues);
            break;
        case "analysis":
            validateLink(value["analysisOf"], ["analysisOf"], issues);
            validateNotebook(value["notebook"], ["notebook"], issues);
            break;
        case "instance":
            validateLink(value["instanceOf"], ["instanceOf"], issues);
            validateTables(value["tables"], ["tables"], issues);
            break;
        case "llmconversation":
            validateLink(value["llmConversationOf"], ["llmConversationOf"], issues);
            if (typeof value["llmModel"] !== "string") {
                issues.push(issue("An LLM conversation must name its model", ["llmModel"]));
            }
            if (!Array.isArray(value["interactions"])) {
                issues.push(issue("An LLM conversation must have interactions", ["interactions"]));
            }
            break;
    }
    return issues;
}
