import { useNavigate } from "@solidjs/router";
import invariant from "tiny-invariant";

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
        if (isFromPetrinaut(data)) {
            try {
                data = convertFromPetrinaut(data);
            } catch {
                throw new Error("Petrinaut file detected but the JSON appears invalid");
            }
        }
        invariant(
            isImportableDocument(data),
            "Only models and diagrams are importable at this time",
        );

        const newRef = await api.createDoc(data);
        navigate(`/${data.type}/${newRef}`);

        props.onComplete?.();
    };

    // Placeholder, not doing more than typechecking does for now but
    // will eventually validate against json schema
    const validateJson = (data: Document) => {
        if (isFromPetrinaut(data)) {
            return true;
        }
        if (!isImportableDocument(data)) {
            return "Only models and diagrams are importable at this time";
        }
        return true;
    };

    return <JsonImport onImport={handleImport} validate={validateJson} />;
}
