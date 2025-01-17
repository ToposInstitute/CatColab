import { useNavigate } from "@solidjs/router";

import type { AnalysisDocument } from "../analysis";
import { useApi } from "../api";
import { JsonImport } from "../components/json_import";
import { type DiagramDocument, createDiagram } from "../diagram";
import { type ModelDocument, createModel } from "../model";

type ccDocument = ModelDocument | DiagramDocument | AnalysisDocument;

export function Import(props: { onComplete?: () => void }) {
    const api = useApi();
    const navigate = useNavigate();
    const handleImport = async (data: ccDocument) => {
        console.log("Imported data:", data);

        switch (data.type) {
            case "model": {
                const newRef = await createModel(api, {
                    ...data,
                    name: `${data.name}`,
                });
                navigate(`/model/${newRef}`);
                break;
            }
            // XX: Probably won't work yet
            case "diagram": {
                const newRef = await createDiagram(api, {
                    ...data,
                    name: `${data.name}`,
                });
                navigate(`/diagram/${newRef}`);
                break;
            }

            case "analysis": {
                throw new Error("Analyses don't currently support initialization.");
            }

            default:
                throw new Error("Unknown document type");
        }

        props.onComplete?.();
    };

    // Placeholder, not doing more than typechecking does for now but
    // will eventually validate against json schema
    const validateJson = (data: ccDocument) => {
        // Return true if valid
        if (data.name && data.notebook && data.type) {
            return true;
        }
        // Return error message if invalid
        return 'JSON must include "name", "notebook", and "type" fields';
    };

    return (
        <div>
            <JsonImport
                onImport={handleImport}
                validate={validateJson} // Optional
            />
        </div>
    );
}
