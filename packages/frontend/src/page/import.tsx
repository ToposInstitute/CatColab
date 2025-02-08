import { useNavigate } from "@solidjs/router";
import { JsonImport } from "../components";
import { useApi, Document } from "../api";
import { ModelDocument, createModel } from "../model";
import { DiagramDocument, createDiagramFromDocument } from "../diagram";
import invariant from "tiny-invariant";

type ImportableDocument = ModelDocument | DiagramDocument;
function isImportableDocument(
    doc: Document<string>
): doc is ImportableDocument {
    return doc.type === "model" || doc.type === "diagram";
}

export function Import(props: { onComplete?: () => void }) {
    const api = useApi();
    const navigate = useNavigate();
    const handleImport = async (data: Document<string>) => {
        invariant(
            isImportableDocument(data),
            "Analysis and other document types cannot be imported at this time."
        );

        switch (data.type) {
            case "model": {
                const newRef = await createModel(api, data as ModelDocument);
                navigate(`/model/${newRef}`);
                break;
            }

            case "diagram": {
                const newRef = await createDiagramFromDocument(api, data as DiagramDocument);
                navigate(`/diagram/${newRef}`);
                break;
            }

            default:
                throw new Error("Unknown document type");
        }

        props.onComplete?.();
    };

    // Placeholder, not doing more than typechecking does for now but
    // will eventually validate against json schema
    const validateJson = (data: Document<string>) => {
        invariant(
            isImportableDocument(data),
            "Analysis and other document types cannot be imported at this time."
        );
            return true;
    };

    return (
        <div>
            <JsonImport onImport={handleImport} validate={validateJson} />
        </div>
    );
}
