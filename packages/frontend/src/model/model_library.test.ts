import { type ChangeFn, Repo } from "@automerge/automerge-repo";
import { afterAll, assert, describe, test } from "vitest";

import { Model, Nb, type ModelDocument } from "catcolab-document-editing";
import { DblModel } from "catlog-wasm";
import { stdTheories } from "../stdlib";
import { Theory } from "../theory";
import { ModelLibrary } from "./model_library";

// Dummy Automerge repo with no networking or storage.
const repo = new Repo();

const models = ModelLibrary.withRepo(repo, stdTheories);
afterAll(() => models.destroy());

describe("Model in library", async () => {
    const modelDoc = Model.newModelDocument({ theory: "empty" });
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
            Nb.appendCell(
                doc.notebook,
                Nb.newFormalCell(Model.newObjectDecl({ tag: "Basic", content: "Object" })),
            );
            Nb.appendCell(doc.notebook, Nb.newRichTextCell());
        });
        assert.strictEqual(generation(), 3);
        assert.strictEqual(status(), "Valid");
    });

    test.sequential("should NOT re-elaborate when rich text is edited", async () => {
        await changeDoc((doc) => {
            const cellId = Nb.getCellIdByIndex(docHandle.doc().notebook, 1);
            const cell = doc.notebook.cellContents[cellId];
            assert(cell?.tag === "rich-text");
            cell.content = "Some text";
        });
        assert.strictEqual(generation(), 3);
    });

    const anotherModelDoc = Model.newModelDocument({ theory: "causal-loop" });
    Nb.appendCell(
        anotherModelDoc.notebook,
        Nb.newFormalCell(Model.newObjectDecl({ tag: "Basic", content: "Object" })),
    );
    const anotherDocHandle = repo.create(modelDoc);

    test.sequential("should automatically include instantiated models", async () => {
        const inst = Model.newInstantiatedModel({
            _id: anotherDocHandle.documentId,
            _version: null,
            _server: "",
            type: "instantiation",
        });
        await changeDoc((doc) => {
            Nb.appendCell(doc.notebook, Nb.newFormalCell(inst));
        });
        assert.strictEqual(generation(), 4);
        assert.strictEqual(status(), "Valid");
        assert.strictEqual(models.size, 2);
    });

    const cyclicModel = Model.newModelDocument({ theory: "empty" });
    const cyclicModelHandle = repo.create(cyclicModel);
    cyclicModelHandle.change((doc) => {
        Nb.appendCell(
            doc.notebook,
            Nb.newFormalCell(
                Model.newInstantiatedModel({
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
