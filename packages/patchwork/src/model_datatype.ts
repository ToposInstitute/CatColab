import * as A from "@automerge/automerge";
import {
    HasVersionControlMetadata,
    Annotation,
    TextPatch,
    DecodedChangeWithMetadata,
} from "@patchwork/sdk/versionControl";
import { type DataTypeImplementation, DocLink, initFrom } from "@patchwork/sdk";
import { Cell, Uuid } from "catlog-wasm";
import { AutomergeUrl, Repo } from "@automerge/automerge-repo";
import { AnalysisDoc, init as initAnalysis } from "./analysis_datatype";

// SCHEMA

export type ModelDoc = HasVersionControlMetadata<Uuid, Cell<unknown>> & {
    name: string;
    theory: string;
    type: string;
    notebook: {
        cells: Cell<unknown>[];
    };
    analysisDocUrl: AutomergeUrl;
};

export const patchesToAnnotations = (doc: ModelDoc, _docBefore: ModelDoc, patches: A.Patch[]) => {
    const changedCells = new Set<Uuid>();
    const annotations: Annotation<Uuid, Cell<unknown>>[] = [];

    // hack: there seems to be a bug in Automerge where view doesn't return the correct version of the snapshot
    // ... but it works if we look up the heads in the history
    const headsBefore = A.getHeads(_docBefore);
    const docBefore = A.getHistory(doc).find(
        ({ change }) => change.hash === headsBefore[0],
    )?.snapshot;

    patches.forEach((patch) => {
        if (patch.path[0] !== "notebook" || patch.path[1] !== "cells") {
            return;
        }

        const cellIndex = patch.path[2] as number;

        if (patch.path.length === 3) {
            switch (patch.action) {
                case "del": {
                    if (!docBefore) {
                        return;
                    }

                    const cell = docBefore.notebook.cells[cellIndex];
                    annotations.push({
                        type: "deleted",
                        deleted: cell,
                        anchor: cell.id,
                    } as Annotation<Uuid, Cell<unknown>>);
                    return;
                }
                case "insert": {
                    changedCells.add(doc.notebook.cells[cellIndex].id);
                    const cell = doc.notebook.cells[cellIndex];
                    annotations.push({
                        type: "added",
                        added: cell,
                        anchor: cell.id,
                    } as Annotation<Uuid, Cell<unknown>>);
                    return;
                }
            }
        }

        switch (patch.action) {
            case "insert":
            case "splice": {
                const after = doc.notebook.cells[cellIndex];

                if (changedCells.has(after.id)) {
                    return;
                }

                const before = docBefore?.notebook.cells.find((cell) => cell.id === after.id);

                if (!before) {
                    annotations.push({
                        type: "added",
                        added: after,
                        anchor: after.id,
                    } as Annotation<Uuid, Cell<unknown>>);
                    changedCells.add(after.id);
                    return;
                }

                annotations.push({
                    type: "changed",
                    before: before,
                    after: after,
                    anchor: after.id,
                } as Annotation<Uuid, Cell<unknown>>);
                changedCells.add(after.id);
                return;
            }
        }
    });

    return annotations;
};

const valueOfAnchor = (doc: ModelDoc, anchor: Uuid): Cell<unknown> => {
    return doc.notebook.cells.find((cell) => cell.id === anchor) as Cell<unknown>;
};

const sortAnchorsBy = (doc: ModelDoc, anchor: Uuid): number => {
    return doc.notebook.cells.findIndex((cell) => cell.id === anchor);
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
    doc.name = "Copy of " + doc.name;
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
            cells: [],
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
    sortAnchorsBy,
    valueOfAnchor,
    patchesToAnnotations,
    includePatchInChangeGroup,
    links,
};
