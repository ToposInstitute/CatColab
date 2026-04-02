import { useNavigate } from "@solidjs/router";

import type { Document } from "catlog-wasm";
import { useApi } from "../api";
import { JsonImport } from "../components";
import { convertFromPetrinaut, isFromPetrinaut } from "./import_from_petrinaut";

const isImportableDocument = (doc: Document) => doc.type === "model" || doc.type === "diagram";

/** Imports a document and navigates to the newly created page. */
export function ImportDocument(props: { onComplete?: () => void }) {
    const api = useApi();
    const navigate = useNavigate();

    const handleImport = async (data: Document) => {
        const newRef = await api.createDoc(data);
        navigate(`/${data.type}/${newRef}`);

        props.onComplete?.();
    };

    const parseDoc = (inputString: string): Document | Error => {
        let doc: Document;
        try {
            doc = JSON.parse(inputString);
        } catch {
            return Error("Invalid JSON");
        }
        if (isFromPetrinaut(doc)) {
            try {
                return convertFromPetrinaut(doc);
            } catch {
                return Error("Petrinaut file detected but the JSON appears invalid");
            }
        }
        if (!isImportableDocument(doc)) {
            return Error("Only models and diagrams are importable at this time");
        }
        return doc;
    };

    return <JsonImport onImport={handleImport} parse={parseDoc} />;
}
