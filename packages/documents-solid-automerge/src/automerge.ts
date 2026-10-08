import type { DocHandle } from "@automerge/automerge-repo";
import { makeDocumentProjection } from "solid-automerge";
import { createMemo, type Accessor } from "solid-js";
import type { Store } from "solid-js/store";

import type { Document } from "catcolab-document-types";
import type { ModelDocument, Notebook, Shape } from "catcolab-documents";
import { createNotebookView } from "./notebook";
import { requireOwner } from "./owner";

/** Patch-backed raw reads; subscriptions belong to the current Solid owner. */
export function createAutomergeDocumentView<T extends object>(
    handle: Accessor<DocHandle<T>>,
): Accessor<Store<T>> {
    requireOwner();
    return createMemo(() => makeDocumentProjection(handle()));
}

export function createAutomergeNotebookView<S extends Shape, H, V>(
    source: Accessor<Notebook<S, ModelDocument, H, V>>,
    handle: (notebook: Notebook<S, ModelDocument, H, V>) => DocHandle<Document>,
) {
    return createNotebookView(source, (notebook) => {
        const projection = createAutomergeDocumentView(() => handle(notebook));
        return () => {
            const document = projection();
            if (document.type !== "model") {
                throw new Error("Notebook views require a model document.");
            }
            return document;
        };
    });
}
