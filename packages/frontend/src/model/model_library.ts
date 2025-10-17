import {
    type AnyDocumentId,
    type DocHandle,
    type DocHandleChangePayload,
    type Patch,
    type Repo,
    interpretAsDocumentId,
} from "@automerge/automerge-repo";
import { ReactiveMap } from "@solid-primitives/map";
import { type Accessor, createResource, onCleanup } from "solid-js";
import invariant from "tiny-invariant";
import * as uuid from "uuid";

import {
    type DblModel,
    DblModelMap,
    type DblTheory,
    type ModelNotebook,
    type ModelValidationResult,
    type Uuid,
    elaborateModel,
} from "catlog-wasm";
import { type Api, type DocRef, type LiveDoc, findAndMigrate, makeLiveDoc } from "../api";
import { NotebookUtils } from "../notebook/types";
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

/** An entry in a `ModelLibrary`. */
export type ModelEntry = {
    /** The double theory that the model is a model of. */
    theory: Theory;

    /** The elaborated and validated model. */
    validatedModel: ValidatedModel;

    /** Generation number, incremented each time the model is elaborated.

    Mainly intended for debugging and testing purposes.
     */
    generation: number;
};

type ModelLibraryParameters<RefId> = {
    canonicalize: (refId: RefId) => ModelKey;
    fetch: (refId: RefId) => Promise<DocHandle<ModelDocument>>;
    docRef?: (refId: RefId) => Promise<DocRef>;
    theories: TheoryLibrary;
};

type ModelHandle = {
    docHandle: DocHandle<ModelDocument>;
    destroy: () => void;
};

type ModelKey = string & { __modelLibraryKey: true };

/** Create a `ModelLibrary` from an API object within a Solid component. */
export function createModelLibraryWithApi(api: Api, theories: TheoryLibrary): ModelLibrary<Uuid> {
    const library = ModelLibrary.withApi(api, theories);
    onCleanup(() => library.destroy());
    return library;
}

/** Create a `ModelLibrary` from an Automerge repo within a Solid component. */
export function createModelLibraryWithRepo(
    repo: Repo,
    theories: TheoryLibrary,
): ModelLibrary<AnyDocumentId> {
    const library = ModelLibrary.withRepo(repo, theories);
    onCleanup(() => library.destroy());
    return library;
}

/** A reactive library of models.

Maintains a library of models, each associated with an Automerge document,
elaborating and validating a model when its associated document changes and
caching the result. Moreover, the cache is reactive when used in a Solid
reactive context.
 */
export class ModelLibrary<RefId> {
    private entries: ReactiveMap<ModelKey, ModelEntry>;
    private handles: Map<ModelKey, ModelHandle>;
    private params: ModelLibraryParameters<RefId>;

    constructor(params: ModelLibraryParameters<RefId>) {
        this.entries = new ReactiveMap();
        this.handles = new Map();
        this.params = params;
    }

    get size(): number {
        return this.entries.size;
    }

    static withApi(api: Api, theories: TheoryLibrary): ModelLibrary<Uuid> {
        return new ModelLibrary<Uuid>({
            canonicalize(refId) {
                invariant(uuid.validate(refId), () => `Ref ID is not a valid UUID: ${refId}`);
                return refId as ModelKey;
            },
            fetch(refId) {
                return api.getDocHandle<ModelDocument>(refId, "model");
            },
            async docRef(refId) {
                const permissions = await api.getPermissions(refId);
                return { refId, permissions };
            },
            theories,
        });
    }

    static withRepo(repo: Repo, theories: TheoryLibrary): ModelLibrary<AnyDocumentId> {
        return new ModelLibrary<AnyDocumentId>({
            canonicalize(docId) {
                return interpretAsDocumentId(docId) as string as ModelKey;
            },
            fetch(docId) {
                return findAndMigrate<ModelDocument>(repo, docId, "model");
            },
            theories,
        });
    }

    /** Destroys the model library.

    Removes all cached document handles and associated event handlers. If you
    create a model library in a component by calling `createModelLibrary`, this
    method will be called automatically when the component unmounts. It is safe
    to call this method multiple times.
     */
    destroy() {
        for (const handle of this.handles.values()) {
            handle.destroy();
        }
        this.handles.clear();
        this.entries.clear();
    }

    /** Adds a model to the library, if it has not already been added. */
    private async addModel(refId: RefId) {
        const key = this.params.canonicalize(refId);
        if (this.entries.has(key)) {
            return;
        }

        const docHandle = await this.params.fetch(refId);
        const [theory, validatedModel] = await this.elaborateAndValidate(docHandle.doc());

        const onChange = (payload: DocHandleChangePayload<ModelDocument>) =>
            this.onChange(key, payload);
        docHandle.on("change", onChange);

        this.handles.set(key, {
            docHandle,
            destroy() {
                docHandle.off("change", onChange);
            },
        });

        this.entries.set(key, {
            theory,
            validatedModel,
            generation: 1,
        });
    }

    private async onChange(key: ModelKey, payload: DocHandleChangePayload<ModelDocument>) {
        const doc = payload.doc;
        if (payload.patches.some((patch) => isPatchToFormalContent(doc, patch))) {
            const [theory, validatedModel] = await this.elaborateAndValidate(doc);

            const generation = (this.entries.get(key)?.generation ?? 0) + 1;
            this.entries.set(key, { theory, validatedModel, generation });
        }
    }

    /** Gets reactive accessor for elaborated model. */
    async getElaboratedModel(refId: RefId): Promise<Accessor<ModelEntry | undefined>> {
        await this.addModel(refId);

        const key = this.params.canonicalize(refId);
        return () => this.entries.get(key);
    }

    /** Gets "live" model containing a reactive model document. */
    async getLiveModel(refId: RefId): Promise<LiveModelDocument> {
        await this.addModel(refId);

        const key = this.params.canonicalize(refId);
        const docHandle = this.handles.get(key)?.docHandle;
        invariant(docHandle);

        const docRef = this.params.docRef ? await this.params.docRef(refId) : undefined;
        const liveDoc = makeLiveDoc(docHandle, docRef);
        return makeLiveModel(liveDoc, () => this.entries.get(key));
    }

    /** Use elaborated model in a component. */
    useElaboratedModel(refId: () => RefId | undefined): Accessor<ModelEntry | undefined> {
        const [resource] = createResource(refId, (refId) => this.getElaboratedModel(refId));
        return () => resource()?.();
    }

    /** Use "live" model in a component. */
    useLiveModel(refId: () => RefId | undefined): Accessor<LiveModelDocument | undefined> {
        const [liveModel] = createResource(refId, (refId) => this.getLiveModel(refId));
        return liveModel;
    }

    private async elaborateAndValidate(doc: ModelDocument): Promise<[Theory, ValidatedModel]> {
        const theory = await this.params.theories.get(doc.theory);

        const instantiated = new DblModelMap();
        for (const cell of NotebookUtils.getFormalContent(doc.notebook)) {
            if (!(cell.tag === "instantiation" && cell.model)) {
                continue;
            }
            const refId = cell.model._id;
            if (instantiated.has(refId)) {
                continue;
            }

            await this.addModel(refId as RefId);
            const entry = this.entries.get(this.params.canonicalize(refId as RefId));
            invariant(entry);
            if (entry.validatedModel.tag === "Illformed") {
                const error = `Instantiated model is ill-formed: ${entry.validatedModel.error}`;
                return [theory, { tag: "Illformed", error }];
            }
            instantiated.set(refId, entry.validatedModel.model);
        }

        const validatedModel = elaborateAndValidateModel(doc.notebook, instantiated, theory.theory);
        return [theory, validatedModel];
    }
}

/** Elaborate and then validate a model notebook. */
function elaborateAndValidateModel(
    notebook: ModelNotebook,
    instantiated: DblModelMap,
    theory: DblTheory,
): ValidatedModel {
    let model: DblModel;
    try {
        model = elaborateModel(notebook, instantiated, theory);
    } catch (e) {
        return { tag: "Illformed", error: String(e) };
    }
    const result = model.validate();
    if (result.tag === "Ok") {
        return { tag: "Valid", model };
    } else {
        return { tag: "Invalid", model, errors: result.content };
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
