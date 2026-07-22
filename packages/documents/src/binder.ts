import { currentVersion } from "catcolab-document-types";
import type { ModelDocument } from "./model-document";
import { notebookFromDocument, type Notebook } from "./notebook";
import type { Shape } from "./shape";

export interface Binder {
    createNotebook<S extends Shape & { readonly theory: string }>(
        shape: S,
        options: { title: string },
    ): Promise<Notebook<S>>;
}

export function createBinder(): Binder {
    return {
        async createNotebook<S extends Shape & { readonly theory: string }>(
            shape: S,
            options: { title: string },
        ) {
            const document: ModelDocument = {
                type: "model",
                name: options.title,
                theory: shape.theory,
                notebook: {
                    cellOrder: [],
                    cellContents: {},
                },
                version: currentVersion(),
            };

            return notebookFromDocument(shape, document);
        },
    };
}
