import type * as Automerge from "@automerge/automerge";
import type { AutomergeUrl, Repo } from "@automerge/automerge-repo";
import { useRepo } from "@automerge/automerge-repo-react-hooks";
import type { Annotation, DiffAnnotation, Pointer } from "@patchwork/sdk/annotations";
import type { Cell, Uuid } from "catlog-wasm";
import React, { useEffect, useRef } from "react";
import type { Component } from "solid-js";
import { createComponent, render } from "solid-js/web";
import type { AnalysisDoc } from "./analysis_datatype";
import type { ModelDoc } from "./model_datatype";
import "./annotations.css";

export class CellPointer<D extends ModelDoc | AnalysisDoc> implements Pointer<D, Uuid, any> {
    constructor(
        readonly doc: D,
        readonly target: Uuid,
    ) {}

    get value(): any {
        return this.doc.notebook.cells.find((cell) => cell.id === this.target)!;
    }
    get sortValue(): string | number | (string | number)[] {
        return this.target;
    }
    doesOverlap(pointer: Pointer<D, Uuid, any>): boolean {
        return this.target === pointer.target;
    }
}

export const patchesToAnnotation = <D extends ModelDoc | AnalysisDoc>(
    docBefore: D,
    docAfter: D,
    patches: Automerge.Patch[],
): DiffAnnotation<D, Uuid, Cell<unknown>>[] => {
    const annotations: DiffAnnotation<D, Uuid, Cell<unknown>>[] = [];

    const newCellIds = new Set<Uuid>();
    const changedCellIds = new Set<Uuid>();

    patches.forEach((patch) => {
        if (patch.path[0] !== "notebook" || patch.path[1] !== "cells") {
            return;
        }

        const cellIndex = patch.path[2] as number;

        switch (patch.action) {
            case "del": {
                const cellId = docBefore.notebook.cells[cellIndex].id;
                const cellAfter = docAfter.notebook.cells.find((cell) => cell.id === cellId);

                if (cellAfter) {
                    if (changedCellIds.has(cellId)) {
                        break;
                    }

                    changedCellIds.add(cellId);
                    annotations.push({
                        type: "changed",
                        before: new CellPointer(docBefore, cellId),
                        after: new CellPointer(docAfter, cellId),
                    });
                } else {
                    annotations.push({
                        type: "deleted",
                        pointer: new CellPointer(docBefore, cellId),
                    });
                }
                break;
            }

            case "splice":
            case "put": {
                const cellId = docAfter.notebook.cells[cellIndex].id;
                const cellBefore = docBefore.notebook.cells.find((cell) => cell.id === cellId);
                if (cellBefore) {
                    if (changedCellIds.has(cellId)) {
                        break;
                    }

                    changedCellIds.add(cellId);
                    annotations.push({
                        type: "changed",
                        before: new CellPointer(docBefore, cellId),
                        after: new CellPointer(docAfter, cellId),
                    });
                } else {
                    if (newCellIds.has(cellId)) {
                        break;
                    }

                    newCellIds.add(cellId);
                    annotations.push({
                        type: "added",
                        pointer: new CellPointer(docAfter, cellId),
                    });
                }
                break;
            }
        }
    });

    return annotations;
};

export type CellAnnotationsViewProps = {
    repo: Repo;
    annotations: Annotation<ModelDoc | AnalysisDoc, Uuid, Cell<unknown>>[];
    docUrl: AutomergeUrl;
};

export function CellAnnotationsViewWrapper({
    annotations,
    docUrl,
    CellAnnotationsView,
}: {
    annotations: Annotation<ModelDoc | AnalysisDoc, Uuid, Cell<unknown>>[];
    docUrl: AutomergeUrl;
    CellAnnotationsView: Component<CellAnnotationsViewProps>;
}) {
    const solidContainerRef = useRef<HTMLDivElement>(null);
    const solidDisposeRef = useRef<(() => void) | null>(null);
    const repo = useRepo();

    useEffect(() => {
        if (solidContainerRef.current) {
            // Clean up previous render
            if (solidDisposeRef.current) {
                solidDisposeRef.current();
            }

            solidDisposeRef.current = render(
                () =>
                    createComponent(CellAnnotationsView, {
                        repo,
                        annotations,
                        docUrl,
                    }),
                solidContainerRef.current,
            );
        }

        // Cleanup on unmount
        return () => {
            if (solidDisposeRef.current) {
                solidDisposeRef.current();
                solidDisposeRef.current = null;
            }
        };
    }, [annotations, repo]);

    // We use React.createElement here to avoid bringing in React's JSX transform.
    // We had some trouble with combining both solid and react JSX in one build.
    return React.createElement("div", { ref: solidContainerRef });
}
