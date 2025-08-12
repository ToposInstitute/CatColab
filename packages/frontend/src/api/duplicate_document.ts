import { type LiveDiagramDocument, createDiagramFromDocument } from "../diagram/document";
import { type LiveModelDocument, createModel } from "../model/document";
import { assertExhaustive } from "../util/assert_exhaustive";
import type { Api } from "./";

/**
 * Duplicates a document (diagram or model) and returns the new reference ID.
 * The duplicated document will have " (copy)" appended to its name.
 */
export async function duplicateDocument(
    api: Api,
    liveDocument: LiveDiagramDocument | LiveModelDocument,
): Promise<string> {
    if (!liveDocument) {
        throw new Error("Cannot duplicate: liveDocument not provided");
    }

    switch (liveDocument.type) {
        case "diagram": {
            const diagram = liveDocument.liveDoc.doc;
            return createDiagramFromDocument(api, {
                ...diagram,
                name: `${diagram.name} (copy)`,
            });
        }
        case "model": {
            const model = liveDocument.liveDoc.doc;
            return createModel(api, {
                ...model,
                name: `${model.name} (copy)`,
            });
        }
        default:
            assertExhaustive(liveDocument);
    }
}
