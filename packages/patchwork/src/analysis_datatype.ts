import type { HasVersionControlMetadata } from "@patchwork/sdk/versionControl";
import { type DataTypeImplementation, initFrom } from "@patchwork/sdk";
import type { AutomergeUrl } from "@automerge/automerge-repo";
import type { Cell, Uuid } from "catlog-wasm";

// SCHEMA

export type AnalysisDoc = HasVersionControlMetadata<Uuid, Cell<unknown>> & {
    name: string;
    theory: string;
    type: string;
    notebook: {
        cells: any[];
    };
    analysisOf?: {
        _id: AutomergeUrl;
    };
    analysisType: "model";
};

// FUNCTIONS

export const markCopy = (doc: AnalysisDoc) => {
    doc.name = `Copy of ${doc.name}`;
};

const setTitle = async (doc: AnalysisDoc, title: string) => {
    doc.name = title;
};

const getTitle = async (doc: AnalysisDoc) => {
    return doc.name || "CatColab Analysis";
};

export const init = (doc: AnalysisDoc) => {
    initFrom(doc, {
        name: "CatColab Analysis",
        theory: "simple-olog",
        type: "analysis",
        analysisType: "model",
        notebook: {
            cells: [],
        },
    });
};

export const dataType: DataTypeImplementation<AnalysisDoc, unknown> = {
    init,
    getTitle,
    setTitle,
    markCopy,
};
