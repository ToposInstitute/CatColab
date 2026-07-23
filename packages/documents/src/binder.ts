import { Model } from "catcolab-document-methods";
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
            const document = Model.newModelDocument({ theory: shape.theory });
            document.name = options.title;

            return notebookFromDocument(shape, document);
        },
    };
}
