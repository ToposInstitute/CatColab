import { type ChangeFn, Repo } from "@automerge/automerge-repo";
import { assert, afterAll, describe, test } from "vitest";

import { DblModel } from "catlog-wasm";
import { NotebookUtils, newFormalCell, newRichTextCell } from "../notebook/types";
import { stdTheories } from "../stdlib";
import { Theory } from "../theory";
import { type ModelDocument, newModelDocument } from "./document";
import { ModelLibrary } from "./model_library";
import { newObjectDecl } from "./types";

// Dummy Automerge repo with no networking or storage.
const repo = new Repo();

const models = ModelLibrary.withRepo(repo, stdTheories);
afterAll(() => models.destroy());

describe("Model in library", async () => {
    const modelDoc = newModelDocument("empty");
    const docHandle = repo.create(modelDoc);
    const docId = docHandle.documentId;

    const getEntry = await models.getElaboratedModel(docId);
    const generation = () => getEntry()?.generation;

    test("should have a generation number", () => {
        assert.strictEqual(generation(), 1);
    });

    test("should have instantiated theory", () => {
        assert(getEntry()?.theory instanceof Theory);
    });

    test("should have elaborated and validated model", () => {
        const validated = getEntry()?.validatedModel;
        assert(validated?.tag === "Valid");
        assert(validated.model instanceof DblModel);
    });

    const changeDoc = async (f: ChangeFn<ModelDocument>) => {
        docHandle.change(f);
        // XXX: Change handler installed by `ModelLibrary` is async.
        await sleep(0);
    };

    // XXX: Pre-load the theory that we'll use.
    await stdTheories.get("causal-loop");

    test.sequential("should re-elaborate when theory changes", async () => {
        await changeDoc((doc) => {
            doc.theory = "causal-loop";
        });
        assert.strictEqual(generation(), 2);
    });

    test.sequential("should NOT re-elaborate when document name changes", async () => {
        await changeDoc((doc) => {
            doc.name = "My causal loop diagram";
        });
        assert.strictEqual(generation(), 2);
    });

    test.sequential("should re-elaborate when notebook cells are added", async () => {
        await changeDoc((doc) => {
            NotebookUtils.appendCell(
                doc.notebook,
                newFormalCell(newObjectDecl({ tag: "Basic", content: "Object" })),
            );
            NotebookUtils.appendCell(doc.notebook, newRichTextCell());
        });
        assert.strictEqual(generation(), 3);

        const validated = getEntry()?.validatedModel;
        assert(validated?.tag === "Valid");
        assert.strictEqual(validated.model.obGenerators().length, 1);
    });

    test.sequential("should NOT re-elaborate when rich text cell is edited", async () => {
        await changeDoc((doc) => {
            const cellId = NotebookUtils.getCellIdByIndex(docHandle.doc().notebook, 1);
            const cell = doc.notebook.cellContents[cellId];
            assert(cell?.tag === "rich-text");
            cell.content = "Some text";
        });
        assert.strictEqual(generation(), 3);
    });
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
