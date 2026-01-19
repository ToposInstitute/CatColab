import * as A from "@automerge/automerge";
import type {
    HasVersionControlMetadata,
    TextPatch,
    DecodedChangeWithMetadata,
} from "@patchwork/sdk/versionControl";
import { type DataTypeImplementation, type DocLink, initFrom } from "@patchwork/sdk";
import type { Cell, Notebook, Uuid } from "catlog-wasm";
import type { AutomergeUrl, Repo } from "@automerge/automerge-repo";
import { type AnalysisDoc, init as initAnalysis } from "./analysis_datatype";

// SCHEMA

export type ModelDoc = HasVersionControlMetadata<Uuid, Cell<unknown>> & {
    name: string;
    theory: string;
    type: string;
    notebook: Notebook<unknown>;
    analysisDocUrl: AutomergeUrl;
};

const includePatchInChangeGroup = (patch: A.Patch | TextPatch) => {
    return patch.path[0] === "notebook";
};

// We filter conservatively with a deny-list because dealing with edits on a nested schema is annoying.
// Would be better to filter with an allow-list but that's tricky with current Automerge APIs.
export const includeChangeInHistory = (doc: ModelDoc) => {
    const metadataObjIds = [
        "branchMetadata",
        "tags",
        "diffBase",
        //"discussions", filter out comment changes for now because we don't surface them in the history
        "changeGroupSummaries",
    ].map((path) => A.getObjectId(doc, path));

    return (decodedChange: DecodedChangeWithMetadata) => {
        return decodedChange.ops.every((op) => !metadataObjIds.includes(op.obj));
    };
};

export const markCopy = (doc: ModelDoc) => {
    doc.name = `Copy of ${doc.name}`;
};

const setTitle = async (doc: ModelDoc, title: string) => {
    doc.name = title;
};

const getTitle = async (doc: ModelDoc) => {
    return doc.name || "CatColab Model";
};

export const init = (doc: ModelDoc, repo: Repo) => {
    const analysisDocHandle = repo.create<AnalysisDoc>();

    analysisDocHandle.change((doc) => {
        initAnalysis(doc);
    });

    initFrom(doc, {
        name: "CatColab Model",
        theory: "simple-olog",
        type: "model",
        notebook: {
            cellOrder: [],
            cellContents: {},
        },
        analysisDocUrl: analysisDocHandle.url,
    });
};

const links = (doc: ModelDoc): DocLink[] => {
    return doc.analysisDocUrl
        ? [
              {
                  url: doc.analysisDocUrl,
                  name: "Analysis",
                  type: "catcolab-analysis",
              },
          ]
        : [];
};

export const dataType: DataTypeImplementation<ModelDoc, Uuid, Cell<unknown>> = {
    init,
    getTitle,
    setTitle,
    markCopy,
    includePatchInChangeGroup,
    links,
};
