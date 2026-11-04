import type { ModelDocument } from "catcolab-document-methods";
import {
    record,
    order,
    type WithIssues,
    type StructuralIssue,
    type StructurallyValid,
} from "../document/parse-structure";

const notebookCache = new WeakMap<object, WithIssues<StructurallyValid<ModelDocument>>>();

/** Build a read-only model document with normalized notebook containers and cell ordering. */
export function parseModelNotebookStructure(
    snapshot: Omit<Readonly<ModelDocument>, "notebook"> & { readonly notebook?: unknown },
): WithIssues<StructurallyValid<ModelDocument>> {
    const cached = notebookCache.get(snapshot);
    if (cached) {
        return cached;
    }
    const issues: StructuralIssue[] = [];
    const notebook = record(snapshot.notebook, ["notebook"], issues);
    const cellContents = record(notebook["cellContents"], ["notebook", "cellContents"], issues);
    const result: WithIssues<StructurallyValid<ModelDocument>> = {
        value: {
            ...snapshot,
            notebook: {
                ...notebook,
                cellContents,
                cellOrder: order(
                    notebook["cellOrder"],
                    cellContents,
                    ["notebook", "cellOrder"],
                    issues,
                ),
            },
        } as unknown as StructurallyValid<ModelDocument>,
        issues,
    };
    notebookCache.set(snapshot, result);
    return result;
}
