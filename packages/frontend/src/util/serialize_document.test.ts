import { next as Automerge } from "@automerge/automerge";
import type { DocHandle } from "@automerge/automerge-repo";
import { Repo } from "@automerge/automerge-repo";
import { assert, describe, test } from "vitest";

import { Model, type ModelDocument, Nb } from "catcolab-document-methods";
import { serializeAutomergeDocument } from "catcolab-document-types";

// Dummy Automerge repo with no networking or storage.
const repo = new Repo();

describe("serializeAutomergeDocument", () => {
    test("serializes rich-text content as spans, not a flattened string", () => {
        const modelDoc = Model.newModelDocument({ theory: "empty" });
        Nb.appendCell(modelDoc.notebook, Nb.newRichTextCell());
        const cellId = modelDoc.notebook.cellOrder[0]!;

        const docHandle: DocHandle<ModelDocument> = repo.create(modelDoc);

        // Build rich-text content directly in the Automerge document, the way
        // the ProseMirror binding does: a paragraph block, some text, a bold
        // run, and an inline-math block marker.
        const contentPath = ["notebook", "cellContents", cellId, "content"];
        docHandle.change((doc) => {
            Automerge.splitBlock(doc, contentPath, 0, {
                type: "paragraph",
                parents: [],
                attrs: {},
            });
            Automerge.splice(doc, contentPath, 1, 0, "E = ");
            // Mark "E = " as bold.
            Automerge.mark(doc, contentPath, { start: 1, end: 5, expand: "none" }, "strong", true);
            Automerge.splitBlock(doc, contentPath, 5, {
                type: "math_inline",
                parents: [],
                attrs: { tex: "mc^2" },
            });
        });

        const serialized = serializeAutomergeDocument(
            Automerge.save(docHandle.doc()),
        ) as ModelDocument;

        const cell = serialized.notebook.cellContents[cellId];
        assert(cell?.tag === "rich-text");
        const spans = cell.content;

        // Content must be a spans array, never a flattened string.
        assert(Array.isArray(spans), "content should be a spans array");
        assert(
            !spans.some((s) => typeof s !== "object"),
            "spans must be objects, not raw string fragments",
        );

        // There should be a bold text span carrying "E = ".
        const boldText = spans.find(
            (s) => s.type === "text" && s.value === "E = " && s.marks?.strong === true,
        );
        assert(boldText, "expected a bold text span 'E = '");

        // There should be an inline-math block marker preserving its tex
        // (stored under the block's `attrs`).
        const mathBlock = spans.find(
            (s) =>
                s.type === "block" &&
                s.block.type === "math_inline" &&
                (s.block.attrs as Record<string, unknown> | undefined)?.tex === "mc^2",
        );
        assert(mathBlock, "expected an inline-math block span with tex 'mc^2'");
    });

    test("produces JSON without U+FFFC object-replacement characters", () => {
        const modelDoc = Model.newModelDocument({ theory: "empty" });
        Nb.appendCell(modelDoc.notebook, Nb.newRichTextCell());
        const cellId = modelDoc.notebook.cellOrder[0]!;

        const docHandle: DocHandle<ModelDocument> = repo.create(modelDoc);
        const contentPath = ["notebook", "cellContents", cellId, "content"];
        docHandle.change((doc) => {
            Automerge.splitBlock(doc, contentPath, 0, {
                type: "paragraph",
                parents: [],
                attrs: {},
            });
            Automerge.splice(doc, contentPath, 1, 0, "hello world");
        });

        const json = JSON.stringify(serializeAutomergeDocument(Automerge.save(docHandle.doc())));
        assert(
            !json.includes("\ufffc"),
            "serialized JSON must not contain U+FFFC placeholders from a flattened Text object",
        );
    });
});
