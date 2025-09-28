import { useNavigate } from "@solidjs/router";
import invariant from "tiny-invariant";

import type { Document } from "catlog-wasm";
import { createDoc, useApi } from "../api";
import { JsonImport } from "../components";

const isImportableDocument = (doc: Document) => doc.type === "model" || doc.type === "diagram";

/** Imports a document and navigates to the newly created page. */
export function ImportDocument(props: { onComplete?: () => void }) {
    const api = useApi();
    const navigate = useNavigate();

    const handleImport = async (data: Document) => {
        invariant(
            isImportableDocument(data),
            "Only models and diagrams are importable at this time",
        );

        const newRef = await createDoc(api, data);
        navigate(`/${data.type}/${newRef}`);

        props.onComplete?.();
    };

    // Placeholder, not doing more than typechecking does for now but
    // will eventually validate against json schema
    const validateJson = (data: Document) => {
        if (!isImportableDocument(data)) {
            return "Only models and diagrams are importable at this time";
        }
        return true;
    };

    return <JsonImport onImport={handleImport} validate={validateJson} />;
}
