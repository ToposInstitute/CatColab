import { describe, expect, test } from "vitest";

import type { Notebook as PersistedNotebook } from "catcolab-document-types";
import { newModelDocument } from "../src/model-document";
import { createNotebookCore, type NotebookCore, type NotebookFormat } from "../src/notebook-core";
import { createNotebookEditor, type FormalCellFamily } from "../src/notebook-editor";
import { createPlainDocumentStore } from "../src/store";

const Alpha = { kind: "alpha" } as const;
const Beta = { kind: "beta" } as const;

type Formal = { family: "alpha"; value: string } | { family: "beta"; value: string };
type AlphaFormal = Extract<Formal, { family: "alpha" }>;
type BetaFormal = Extract<Formal, { family: "beta" }>;

function attachedCell(core: NotebookCore<Formal>, id: string) {
    return {
        id,
        get value() {
            const cell = core.get(id);
            return cell?.tag === "formal" ? cell.content.value : undefined;
        },
    };
}

describe("generic notebook editor", () => {
    test("composes independent formal cell families over a union", async () => {
        const store = createPlainDocumentStore();
        const handle = await store.createHandle(newModelDocument("test", "Mixed notebook"));
        const format: NotebookFormat<"model", Formal> = {
            documentType: "model",
            getNotebook: (document) => document.notebook as unknown as PersistedNotebook<Formal>,
            changeNotebook: (document, change) =>
                change(document.notebook as unknown as PersistedNotebook<Formal>),
        };
        const core = createNotebookCore(store, handle, format);

        const alphaFamily: FormalCellFamily<AlphaFormal> = {
            supportsType: (type) => (type as { kind?: unknown }).kind === "alpha",
            supportsContent: (content): content is AlphaFormal =>
                (content as { family?: unknown }).family === "alpha",
            create: (_type, value) => ({
                family: "alpha",
                value: (value as { value: string }).value,
            }),
            attach: (id) => attachedCell(core, id),
            matches: (_type, content) => (content as { family?: unknown }).family === "alpha",
            duplicate: (content) => ({
                ...(content as Extract<Formal, { family: "alpha" }>),
                value: `${(content as { value: string }).value} copy`,
            }),
        };
        const betaFamily: FormalCellFamily<BetaFormal> = {
            supportsType: (type) => (type as { kind?: unknown }).kind === "beta",
            supportsContent: (content): content is BetaFormal =>
                (content as { family?: unknown }).family === "beta",
            create: (_type, value) => ({
                family: "beta",
                value: (value as { value: string }).value,
            }),
            attach: (id) => attachedCell(core, id),
            matches: (_type, content) => (content as { family?: unknown }).family === "beta",
            duplicate: (content) => ({
                ...(content as Extract<Formal, { family: "beta" }>),
                value: `${(content as { value: string }).value} copy`,
            }),
        };
        const editor = createNotebookEditor(core, [alphaFamily, betaFamily]);

        const alpha = editor.add(Alpha, { value: "A" }) as ReturnType<typeof attachedCell>;
        editor.add(Beta, { value: "B" });

        expect(editor.cellsOf(Alpha)).toHaveLength(1);
        expect(editor.cellsOf(Beta)).toHaveLength(1);

        const duplicateId = core.duplicate(alpha.id);
        const duplicate = editor.get(Alpha, duplicateId);
        expect(duplicate).toMatchObject({ tag: "Ok", content: { value: "A copy" } });
    });
});
