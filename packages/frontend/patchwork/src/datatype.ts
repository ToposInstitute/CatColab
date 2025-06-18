import { HasVersionControlMetadata } from "@patchwork/sdk/versionControl";
import { type DataTypeImplementation, initFrom } from "@patchwork/sdk";

// SCHEMA

export type Doc = HasVersionControlMetadata<unknown, unknown> & {
    name: string;
    theory: string;
    type: string;
    notebook: {
        cells: any[];
    };
};

// FUNCTIONS

export const markCopy = (doc: Doc) => {
    doc.name = "Copy of " + doc.name;
};

const setTitle = async (doc: Doc, title: string) => {
    doc.name = title;
};

const getTitle = async (doc: Doc) => {
    return doc.name || "Model";
};

export const init = (doc: Doc) => {
    initFrom(doc, {
        name: "New Model",
        theory: "simple-olog",
        type: "model",
        notebook: {
            cells: [],
        },
    });
};

export const dataType: DataTypeImplementation<Doc, unknown> = {
    init,
    getTitle,
    setTitle,
    markCopy,
};
