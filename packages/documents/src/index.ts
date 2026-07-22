import { currentVersion, type Document } from "catcolab-document-types";

export interface Shape {
    readonly theory: string;
    readonly objects?: readonly unknown[];
    readonly morphisms?: readonly unknown[];
}

type ModelDocument = Extract<Document, { type: "model" }>;

export interface Notebook<S extends Shape> {
    readonly shape: S;
    readonly document: ModelDocument;
    readonly title: string;

    cells(): readonly unknown[];
}

export interface Binder {
    createNotebook<S extends Shape>(shape: S, options: { title: string }): Promise<Notebook<S>>;
}

function notebookFromDocument<S extends Shape>(shape: S, document: ModelDocument): Notebook<S> {
    return {
        shape,
        document,
        get title() {
            return document.name;
        },
        cells() {
            return document.notebook.cellOrder.map(
                (cellId) => document.notebook.cellContents[cellId],
            );
        },
    };
}

export function createBinder(): Binder {
    return {
        async createNotebook<S extends Shape>(shape: S, options: { title: string }) {
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

export const RichText = { kind: "rich-text" } as const;
