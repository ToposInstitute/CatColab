import {
    type AnyDocumentId,
    type DocHandle,
    type DocHandleChangePayload,
    type DocumentId,
    type Patch,
    type Repo,
    interpretAsDocumentId,
} from "@automerge/automerge-repo";
import { ReactiveMap } from "@solid-primitives/map";
import { type Accessor, createResource, onCleanup } from "solid-js";

import { type DblModel, type ModelValidationResult, type Uuid, elaborateModel } from "catlog-wasm";
import { type Api, type LiveDoc, getLiveDocFromDocHandle } from "../api";
import { NotebookUtils } from "../notebook";
import type { Theory, TheoryLibrary } from "../theory";
import type { LiveModelDocument, ModelDocument } from "./document";

/** An elaborated model along with its validation status. */
export type ValidatedModel =
    /** A successfully elaborated and validated model. */
    | {
          tag: "Valid";
          model: DblModel;
      }
    /** An elaborated model with one or more validation errors. */
    | {
          tag: "Invalid";
          model: DblModel;
          errors: (ModelValidationResult & { tag: "Err" })["content"];
      }
    /** A model that failed to even elaborate. */
    | {
          tag: "Illformed";
          error: string;
      };

/** An entry in the model library, comprising a model and its theory. */
export type ModelEntry = {
    theory: Theory;
    validatedModel: ValidatedModel;
};

/** Create a new `ModelLibrary` in a Solid component.

Ensures that the library is properly cleaned up when the component is unmounted.
 */
export function createModelLibrary(theories: TheoryLibrary): ModelLibrary {
    const library = new ModelLibrary(theories);

    onCleanup(() => library.destroy());

    return library;
}

/** A reactive library of models.

Maintains a library of models, each associated with an Automerge document,
elaborating and validating each model when the document changes and caching the
result. Moreover, the cache is reactive when used in a Solid reactive context.
 */
export class ModelLibrary {
    private modelMap: ReactiveMap<DocumentId, ModelEntry>;
    private destructors: Map<DocumentId, () => void>;
    private theories: TheoryLibrary;

    constructor(theories: TheoryLibrary) {
        this.modelMap = new ReactiveMap();
        this.destructors = new Map();
        this.theories = theories;
    }

    /** Destroys the model library.

    Removes all event handlers that re-elaborate models on document changes. If
    you create a model library in a component by calling `createModelLibarary`,
    this method will be called automatically when the component unmounts.
     */
    destroy() {
        for (const destructor of this.destructors.values()) {
            destructor();
        }
        this.destructors.clear();
        this.modelMap.clear();
    }

    private async addModelWithDocId(repo: Repo, docId: DocumentId) {
        if (this.modelMap.has(docId)) {
            return;
        }
        const docHandle = await repo.find<ModelDocument>(docId);
        await this.addModelFromDocHandle(docHandle);
    }

    private async addModelFromDocHandle(docHandle: DocHandle<ModelDocument>) {
        if (this.modelMap.has(docHandle.documentId)) {
            return;
        }
        const handler = (payload: DocHandleChangePayload<ModelDocument>) => this.onChange(payload);
        docHandle.on("change", handler);

        const destroy = () => docHandle.off("change", handler);
        this.destructors.set(docHandle.documentId, destroy);

        const entry = await elaborateAndValidateModel(docHandle.doc(), this.theories);
        this.modelMap.set(docHandle.documentId, entry);
    }

    private async onChange(payload: DocHandleChangePayload<ModelDocument>) {
        const doc = payload.doc;
        if (payload.patches.some((patch) => isPatchToFormalContent(doc, patch))) {
            const entry = await elaborateAndValidateModel(doc, this.theories);
            this.modelMap.set(payload.handle.documentId, entry);
        }
    }

    /** Get accessor for elaborated model with given document ref ID. */
    async getElaboratedModelWithRefId(
        api: Api,
        refId: Uuid,
    ): Promise<Accessor<ModelEntry | undefined>> {
        const docId = await api.getDocId(refId);
        return await this.getElaboratedModelWithDocId(api.repo, docId);
    }

    /** Get accessor for elaborated model with given Automerge document ID. */
    async getElaboratedModelWithDocId(
        repo: Repo,
        id: AnyDocumentId,
    ): Promise<Accessor<ModelEntry | undefined>> {
        const docId = interpretAsDocumentId(id);
        await this.addModelWithDocId(repo, docId);
        return () => this.modelMap.get(docId);
    }

    /** Get "live" model with given document ref ID. */
    async getLiveModelWithRefId(api: Api, refId: Uuid): Promise<LiveModelDocument> {
        const liveDoc = await api.getLiveDoc<ModelDocument>(refId, "model");
        const docHandle = liveDoc.docHandle;
        await this.addModelFromDocHandle(docHandle);

        return makeLiveModel(liveDoc, () => this.modelMap.get(docHandle.documentId));
    }

    /** Get "live" model from given Automerge document ID. */
    async getLiveModelWithDocId(repo: Repo, id: AnyDocumentId): Promise<LiveModelDocument> {
        const docId = interpretAsDocumentId(id);
        const docHandle = await repo.find<ModelDocument>(docId);
        await this.addModelFromDocHandle(docHandle);

        const liveDoc = getLiveDocFromDocHandle(docHandle);
        return makeLiveModel(liveDoc, () => this.modelMap.get(docId));
    }

    /** Use elaborated model with given document ref ID in a component. */
    useElaboratedModelWithRefId(
        api: Api,
        refId: () => Uuid | undefined,
    ): Accessor<ModelEntry | undefined> {
        const [resource] = createResource(refId, (refId) =>
            this.getElaboratedModelWithRefId(api, refId),
        );
        return () => resource()?.();
    }

    /** Use elaborated model with given Automerge document ID in a component. */
    useElaboratedModelWithDocId(
        repo: Repo,
        docId: () => AnyDocumentId | undefined,
    ): Accessor<ModelEntry | undefined> {
        const [resource] = createResource(docId, (docId) =>
            this.getElaboratedModelWithDocId(repo, docId),
        );
        return () => resource()?.();
    }

    /** Use "live" model with given document ref ID in a component. */
    useLiveModelWithRefId(
        api: Api,
        refId: () => Uuid | undefined,
    ): Accessor<LiveModelDocument | undefined> {
        const [liveModel] = createResource(refId, (refId) =>
            this.getLiveModelWithRefId(api, refId),
        );
        return liveModel;
    }

    /** Use "live" model with given Automerge doc ID in a component. */
    useLiveModelWithDocId(
        repo: Repo,
        docId: () => AnyDocumentId | undefined,
    ): Accessor<LiveModelDocument | undefined> {
        const [liveModel] = createResource(docId, (docId) =>
            this.getLiveModelWithDocId(repo, docId),
        );
        return liveModel;
    }
}

/** Elaborate and then validate a model document. */
async function elaborateAndValidateModel(
    doc: ModelDocument,
    theories: TheoryLibrary,
): Promise<ModelEntry> {
    const theory = await theories.get(doc.theory);

    const formalJudgments = NotebookUtils.getFormalContent(doc.notebook);
    let model: DblModel;
    try {
        model = elaborateModel(formalJudgments, theory.theory);
    } catch (e) {
        return { theory, validatedModel: { tag: "Illformed", error: String(e) } };
    }
    const result = model.validate();
    if (result.tag === "Ok") {
        return { theory, validatedModel: { tag: "Valid", model } };
    } else {
        return { theory, validatedModel: { tag: "Invalid", model, errors: result.content } };
    }
}

/** Does the patch to the model document affect its formal content? */
function isPatchToFormalContent(doc: ModelDocument, patch: Patch): boolean {
    const path = patch.path;
    if (!(path[0] === "theory" || path[0] === "notebook")) {
        // Ignore changes to top-level data like document name.
        return false;
    }
    if (path[0] === "notebook" && path[1] === "cellContents" && path[2]) {
        // Ignores changes to cells without formal content.
        const cell = doc.notebook.cellContents[path[2]];
        if (cell?.tag !== "formal") {
            return false;
        }
        // TODO: When only the human-readable labels are changed, update the
        // id-label mappings but don't re-elaborate the model!
    }
    return true;
}

const makeLiveModel = (
    liveDoc: LiveDoc<ModelDocument>,
    getEntry: Accessor<ModelEntry | undefined>,
): LiveModelDocument => ({
    type: "model",
    liveDoc,
    theory() {
        return getEntry()?.theory;
    },
    elaboratedModel() {
        const entry = getEntry();
        if (entry && entry.validatedModel.tag !== "Illformed") {
            return entry.validatedModel.model;
        }
    },
    validatedModel() {
        return getEntry()?.validatedModel;
    },
});
