import { type ChangeFn, Repo } from "@automerge/automerge-repo";
import { DblModel } from "catlog-wasm";
import { afterAll, assert, describe, test } from "vitest";
import { NotebookUtils, newFormalCell, newRichTextCell } from "../notebook/types";
import { stdTheories } from "../stdlib";
import { Theory } from "../theory";
import { type ModelDocument, newModelDocument } from "./document";
import { ModelLibrary } from "./model_library";
import { newInstantiatedModel, newObjectDecl } from "./types";

// Dummy Automerge repo with no networking or storage.
const repo = new Repo();

const models = ModelLibrary.withRepo(repo, stdTheories);
afterAll(() => models.destroy());

describe("Model in library", async () => {
    const modelDoc = newModelDocument("empty");
    const docHandle = repo.create(modelDoc);

    const getEntry = await models.getElaboratedModel(docHandle.documentId);
    const generation = () => getEntry()?.generation;
    const status = () => getEntry()?.validatedModel.tag;

    test("should have generation number", () => {
        assert.strictEqual(generation(), 1);
        assert.strictEqual(models.size, 1);
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
        assert.strictEqual(status(), "Valid");
        assert.strictEqual(models.size, 1);
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
        assert.strictEqual(status(), "Valid");
    });

    test.sequential("should NOT re-elaborate when rich text is edited", async () => {
        await changeDoc((doc) => {
            const cellId = NotebookUtils.getCellIdByIndex(docHandle.doc().notebook, 1);
            const cell = doc.notebook.cellContents[cellId];
            assert(cell?.tag === "rich-text");
            cell.content = "Some text";
        });
        assert.strictEqual(generation(), 3);
    });

    const anotherModelDoc = newModelDocument("causal-loop");
    NotebookUtils.appendCell(
        anotherModelDoc.notebook,
        newFormalCell(newObjectDecl({ tag: "Basic", content: "Object" })),
    );
    const anotherDocHandle = repo.create(modelDoc);

    test.sequential("should automatically include instantiated models", async () => {
        const inst = newInstantiatedModel({
            _id: anotherDocHandle.documentId,
            _version: null,
            _server: "",
            type: "instantiation",
        });
        await changeDoc((doc) => {
            NotebookUtils.appendCell(doc.notebook, newFormalCell(inst));
        });
        assert.strictEqual(generation(), 4);
        assert.strictEqual(status(), "Valid");
        assert.strictEqual(models.size, 2);
    });

    const cyclicModel = newModelDocument("empty");
    const cyclicModelHandle = repo.create(cyclicModel);
    cyclicModelHandle.change((doc) => {
        NotebookUtils.appendCell(
            doc.notebook,
            newFormalCell(
                newInstantiatedModel({
                    _id: cyclicModelHandle.documentId,
                    _version: null,
                    _server: "",
                    type: "instantiation",
                }),
            ),
        );
    });

    test("should gracefully fail to elaborate when it has a cycle", async () => {
        const getEntry = await models.getElaboratedModel(cyclicModelHandle.documentId);
        assert.strictEqual(getEntry()?.validatedModel.tag, "Illformed");
    });
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
