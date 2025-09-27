import { useNavigate } from "@solidjs/router";
import invariant from "tiny-invariant";

import type { Document } from "catlog-wasm";
import { useApi } from "../api";
import { JsonImport } from "../components";
import { type DiagramDocument, createDiagramFromDocument } from "../diagram";
import { type ModelDocument, createModel } from "../model";

type ImportableDocument = ModelDocument | DiagramDocument;

function isImportableDocument(doc: Document): doc is ImportableDocument {
    return doc.type === "model" || doc.type === "diagram";
}

/** Imports a document and navigates to the newly created page. */
export function ImportDocument(props: { onComplete?: () => void }) {
    const api = useApi();
    const navigate = useNavigate();

    const handleImport = async (data: Document) => {
        invariant(
            isImportableDocument(data),
            "Analysis and other document types cannot be imported at this time.",
        );

        switch (data.type) {
            case "model": {
                const newRef = await createModel(api, data);
                try {
                    navigate(`/model/${newRef}`);
                } catch (e) {
                    throw new Error(`Failed to navigate to new ${data.type}: ${e}`);
                }
                break;
            }

            case "diagram": {
                const newRef = await createDiagramFromDocument(api, data);
                try {
                    navigate(`/diagram/${newRef}`);
                } catch (e) {
                    throw new Error(`Failed to navigate to new ${data.type}: ${e}`);
                }
                break;
            }

            default:
                throw new Error("Unknown document type");
        }

        props.onComplete?.();
    };

    // Placeholder, not doing more than typechecking does for now but
    // will eventually validate against json schema
    const validateJson = (data: Document) => {
        if (!isImportableDocument(data)) {
            return "Analysis and other document types cannot be imported at this time.";
        }
        return true;
    };

    return <JsonImport onImport={handleImport} validate={validateJson} />;
}
