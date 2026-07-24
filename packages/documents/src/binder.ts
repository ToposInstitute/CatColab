import { Model } from "catcolab-document-methods";
import type { ModelDocument } from "./model-document";
import { notebookFromModel, type Notebook } from "./notebook";
import type { Shape } from "./shape";

export interface Binder {
    createNotebook<S extends Shape & { readonly theory: string }>(
        shape: S,
        options: { title: string },
    ): Promise<Notebook<S, ModelDocument>>;
}

export function createBinder(): Binder {
    return {
        async createNotebook<S extends Shape & { readonly theory: string }>(
            shape: S,
            options: { title: string },
        ) {
            const document = Model.newModelDocument({ theory: shape.theory });
            document.name = options.title;

            return notebookFromModel(shape, document);
        },
    };
}
