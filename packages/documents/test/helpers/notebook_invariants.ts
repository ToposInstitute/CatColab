import { expect } from "vitest";

import type { Document } from "catcolab-document-types";

export type NotebookWithDocument = {
    readonly document: Document;
    cells(): readonly { id: string }[];
    dump(): unknown;
};

/** Assert that the persisted notebook index and the public cell view agree. */
export function assertNotebookStructureIsConsistent(notebook: NotebookWithDocument): void {
    const document = notebook.document;
    if (document.type !== "model") {
        throw new Error(`Expected a model document, got ${document.type}.`);
    }

    const { cellContents, cellOrder } = document.notebook;
    const contentIds = Object.keys(cellContents);

    expect(new Set(cellOrder).size).toBe(cellOrder.length);
    expect(cellOrder.toSorted()).toEqual(contentIds.toSorted());

    const formalIds: string[] = [];
    for (const id of cellOrder) {
        const cell = cellContents[id];
        expect(cell).toBeDefined();
        expect(cell?.id).toBe(id);
        if (cell?.tag === "formal") {
            formalIds.push(cell.content.id);
        }
    }

    expect(new Set(formalIds).size).toBe(formalIds.length);
    expect(notebook.cells().map((cell) => cell.id)).toEqual(cellOrder);

    const dump = notebook.dump();
    expect(() => structuredClone(dump)).not.toThrow();
    expect(() => JSON.parse(JSON.stringify(dump))).not.toThrow();
}
