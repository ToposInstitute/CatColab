import type { DocHandle } from "@automerge/automerge-repo";
import type { Accessor } from "solid-js";

import type { Document } from "catcolab-document-types";
import type { ModelDocument, Notebook, Shape } from "catcolab-documents";
import { createDocumentView } from "../../src";
import { createNotebookView } from "./notebook";

export function createAutomergeNotebookView<S extends Shape, H, V>(
    source: Accessor<Notebook<S, ModelDocument, H, V>>,
    handle: (notebook: Notebook<S, ModelDocument, H, V>) => DocHandle<Document>,
) {
    return createNotebookView(source, (notebook) => {
        const projection = createDocumentView(() => handle(notebook));
        return () => {
            const document = projection();
            if (document.type !== "model") {
                throw new Error("Notebook views require a model document.");
            }
            return document;
        };
    });
}
