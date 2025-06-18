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
    return doc.name || "CatColab Analysis";
};

export const init = (doc: Doc) => {
    initFrom(doc, {
        name: "CatColab Analysis",
        theory: "simple-olog",
        type: "analysis",
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
