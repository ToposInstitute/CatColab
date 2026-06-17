import {
    type AnyDocumentId,
    type DocHandle,
    type DocHandleChangePayload,
    interpretAsDocumentId,
    type Patch,
    type Repo,
} from "@automerge/automerge-repo";
import { ReactiveMap } from "@solid-primitives/map";
import { type Accessor, createResource, onCleanup } from "solid-js";
import invariant from "tiny-invariant";
import * as uuid from "uuid";

import { Nb, type DiagramDocument } from "catcolab-document-methods";
import {
    type DblDiagram,
    DblDiagramMap,
    type DblTheory,
    type Document,
    elaborateDiagram,
    type DiagramNotebook,
    type DiagramValidationResult,
    type Uuid,
} from "catlog-wasm";
import { type Api, findAndMigrate, type LiveDoc, makeLiveDoc } from "../api";
import type { Theory, TheoryLibrary } from "../theory";
import type { LiveDiagramDoc } from "./document";

/** An elaborated diagram along with its validation status. */
export type ValidatedDiagram =
    /** A successfully elaborated and validated diagram. */
    | {
          tag: "Valid";
          diagram: DblDiagram;
      }
    /** An elaborated diagram with one or more validation errors. */
    | {
          tag: "Invalid";
          diagram: DblDiagram;
          errors: (DiagramValidationResult & { tag: "Err" })["content"];
      }
    /** A diagram that failed to even elaborate. */
    | {
          tag: "Illformed";
          diagram: null;
          error: string;
      };

/** An entry in a `DiagramLibrary`. */
export type DiagramEntry = {
    /** The double theory that the diagram is a diagram of. */
    theory: Theory;

    /** The elaborated and validated diagram. */
    validatedDiagram: ValidatedDiagram;

    /** Generation number, incremented each time the diagram is elaborated.

    Mainly intended for debugging and testing purposes.
     */
    generation: number;
};

type DiagramLibraryParameters<RefId> = {
    canonicalize: (refId: RefId) => DiagramKey;
    fetch: (refId: RefId) => Promise<DocHandle<Document>>;
    theories: TheoryLibrary;
};

type DiagramKey = string & { __diagramLibraryKey: true };

type DocHandleWithDestructor = {
    docHandle: DocHandle<Document>;
    destroy: () => void;
};

/** Create a `DiagramLibrary` from an API object within a Solid component. */
export function createDiagramLibraryWithApi(
    api: Api,
    theories: TheoryLibrary,
): DiagramLibrary<Uuid> {
    const library = DiagramLibrary.withApi(api, theories);
    onCleanup(() => library.destroy());
    return library;
}

/** Create a `DiagramLibrary` from an Automerge repo within a Solid component. */
export function createDiagramLibraryWithRepo(
    repo: Repo,
    theories: TheoryLibrary,
): DiagramLibrary<AnyDocumentId> {
    const library = DiagramLibrary.withRepo(repo, theories);
    onCleanup(() => library.destroy());
    return library;
}

/** A reactive library of diagrams.

Maintains a library of diagrams, each associated with an Automerge document,
elaborating and validating a diagram when its associated document changes and
caching the result. Moreover, the cache is reactive when used in a Solid
reactive context.
 */
export class DiagramLibrary<RefId> {
    private entries: ReactiveMap<DiagramKey, DiagramEntry>;
    private handles: Map<DiagramKey, DocHandleWithDestructor>;
    private isElaborating: Set<DiagramKey>;
    private params: DiagramLibraryParameters<RefId>;

    constructor(params: DiagramLibraryParameters<RefId>) {
        this.entries = new ReactiveMap();
        this.handles = new Map();
        this.isElaborating = new Set();
        this.params = params;
    }

    get size(): number {
        return this.entries.size;
    }

    static withApi(api: Api, theories: TheoryLibrary): DiagramLibrary<Uuid> {
        return new DiagramLibrary<Uuid>({
            canonicalize(refId) {
                invariant(uuid.validate(refId), () => `Ref ID is not a valid UUID: ${refId}`);
                return refId as DiagramKey;
            },
            fetch(refId) {
                return api.getDocHandle(refId);
            },
            theories,
        });
    }

    static withRepo(repo: Repo, theories: TheoryLibrary): DiagramLibrary<AnyDocumentId> {
        return new DiagramLibrary<AnyDocumentId>({
            canonicalize(docId) {
                return interpretAsDocumentId(docId) as string as DiagramKey;
            },
            fetch(docId) {
                return findAndMigrate(repo, docId);
            },
            theories,
        });
    }

    /** Destroys the diagram library.

    Removes all cached document handles and associated event handlers. If you
    create a diagram library in a component by calling `createDiagramLibrary`, this
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

    /** Adds a diagram to the library, if it has not already been added. */
    private async addDiagram(refId: RefId) {
        const key = this.params.canonicalize(refId);
        if (this.entries.has(key)) {
            return;
        }

        const docHandle = await this.params.fetch(refId);
        const [theory, validatedDiagram] = await this.elaborateAndValidate(key, docHandle.doc());

        const onChange = (payload: DocHandleChangePayload<Document>) => this.onChange(key, payload);
        docHandle.on("change", onChange);

        this.handles.set(key, {
            docHandle,
            destroy() {
                docHandle.off("change", onChange);
            },
        });

        this.entries.set(key, {
            theory,
            validatedDiagram,
            generation: 1,
        });
    }

    private async onChange(key: DiagramKey, payload: DocHandleChangePayload<Document>) {
        const doc = payload.doc;
        if (payload.patches.some((patch) => isPatchToFormalContent(doc, patch))) {
            const [theory, validatedDiagram] = await this.elaborateAndValidate(key, doc);

            const generation = (this.entries.get(key)?.generation ?? 0) + 1;
            this.entries.set(key, { theory, validatedDiagram, generation });
        }
    }

    /** Gets reactive accessor for elaborated diagram. */
    async getElaboratedDiagram(refId: RefId): Promise<Accessor<DiagramEntry | undefined>> {
        await this.addDiagram(refId);

        const key = this.params.canonicalize(refId);
        return () => this.entries.get(key);
    }

    /** Gets "live" diagram containing a reactive diagram document. */
    async getLiveDiagram(refId: RefId): Promise<LiveDiagramDoc> {
        await this.addDiagram(refId);

        const key = this.params.canonicalize(refId);
        const docHandle = this.handles.get(key)?.docHandle;
        invariant(docHandle);

        const liveDoc = makeLiveDoc<DiagramDocument>(docHandle, "diagram");
        return makeLiveDiagram(liveDoc, () => this.entries.get(key));
    }

    // temporary method to get diagrams without validating :o
    async getLiveDiagramWithInstantiations(
        refId: RefId,
    ): Promise<[Theory, LiveDiagramDoc, Map<string, Document>]> {
        await this.addDiagram(refId);
        const key = this.params.canonicalize(refId);
        const docHandle = this.handles.get(key)?.docHandle;
        invariant(docHandle);
        const doc = docHandle.doc();
        const theories = this.params.theories;
        const theory = await theories.get(doc.theory);
        const [liveDiagram, subDiagrams] = await this._getLiveDiagramWithInstantiations(
            key,
            doc.notebook,
            theory.theory,
        );
        return [theory, liveDiagram, subDiagrams];
    }

    //
    private async _getLiveDiagramWithInstantiations(
        key: DiagramKey,
        notebook: DiagramNotebook,
        theory: DblTheory,
    ): Promise<[LiveDiagramDoc, Map<string, Document>]> {
        const subDiagrams = new Map<string, Document>();
        for (const cell of Nb.getFormalContent(notebook)) {
            if (!(cell.tag === "instantiation" && cell.diagram)) continue;
            const refId = cell.diagram._id;
            if (subDiagrams.has(refId)) continue;
            await this.addDiagram(refId as RefId);
            const handleEntry = this.handles.get(this.params.canonicalize(refId as RefId));
            invariant(handleEntry);
            subDiagrams.set(refId, handleEntry.docHandle.doc());
        }
        const liveDiagram = await this.getLiveDiagram(key as RefId);
        return [liveDiagram, subDiagrams];
    }

    /** Use elaborated diagram in a component. */
    useElaboratedDiagram(refId: () => RefId | undefined): Accessor<DiagramEntry | undefined> {
        const [resource] = createResource(refId, (refId) => this.getElaboratedDiagram(refId));
        return () => resource()?.();
    }

    /** Use "live" diagram in a component. */
    useLiveDiagram(refId: () => RefId | undefined): Accessor<LiveDiagramDoc | undefined> {
        const [liveDiagram] = createResource(refId, (refId) => this.getLiveDiagram(refId));
        return liveDiagram;
    }

    // Outer method detects cycles to avoid looping infinitely.
    private async elaborateAndValidate(
        key: DiagramKey,
        doc: Document,
    ): Promise<[Theory, ValidatedDiagram]> {
        const theories = this.params.theories;

        if (doc.type !== "diagram" || !doc.theory) {
            const theory = await theories.get(theories.defaultTheoryMetadata().id);
            const validatedDiagram: ValidatedDiagram = {
                tag: "Illformed",
                diagram: null,
                error: `Document should be a diagram, but has type: ${doc.type}`,
            };
            return [theory, validatedDiagram];
        }

        const theory = await theories.get(doc.theory);
        let validatedDiagram: ValidatedDiagram;
        try {
            if (this.isElaborating.has(key)) {
                const error = "Diagram contains a cycle of instantiations";
                validatedDiagram = { tag: "Illformed", diagram: null, error };
            } else {
                this.isElaborating.add(key);
                validatedDiagram = await this._elaborateAndValidate(
                    key,
                    doc.notebook,
                    theory.theory,
                );
            }
        } finally {
            this.isElaborating.delete(key);
        }

        return [theory, validatedDiagram];
    }

    // Inner method actually elaborates. Do not call directly!
    private async _elaborateAndValidate(
        key: DiagramKey,
        notebook: DiagramNotebook,
        theory: DblTheory,
    ): Promise<ValidatedDiagram> {
        return {
            tag: "Illformed",
            diagram: null,
            error: "Diagram elaboration not yet implemented",
        };
        // const instantiated = new DblDiagramMap();
        // for (const cell of Nb.getFormalContent(notebook)) {
        //     if (!(cell.tag === "instantiation" && cell.diagram)) {
        //         continue;
        //     }
        //     const refId = cell.diagram._id;
        //     if (instantiated.has(refId)) {
        //         continue;
        //     }

        //     await this.addDiagram(refId as RefId);
        //     const entry = this.entries.get(this.params.canonicalize(refId as RefId));
        //     invariant(entry);
        //     if (entry.validatedDiagram.tag === "Illformed") {
        //         const error = `Instantiated diagram is ill-formed: ${entry.validatedDiagram.error}`;
        //         return { tag: "Illformed", diagram: null, error };
        //     }
        //     instantiated.set(refId, entry.validatedDiagram.diagram);
        // }

        // return elaborateAndValidateDiagram(notebook, instantiated, theory, key);
    }
}

/** Elaborate and then validate a diagram notebook. */
function elaborateAndValidateDiagram(
    notebook: DiagramNotebook,
    instantiated: DblDiagramMap,
    theory: DblTheory,
    refId: string,
): ValidatedDiagram {
    let diagram: DblDiagram;
    try {
        diagram = elaborateDiagram(notebook, instantiated, theory, refId);
    } catch (e) {
        return { tag: "Illformed", diagram: null, error: String(e) };
    }
    const result = diagram.validate();
    if (result.tag === "Ok") {
        return { tag: "Valid", diagram };
    } else {
        return { tag: "Invalid", diagram, errors: result.content };
    }
}

/** Does the patch to the diagram document affect its formal content? */
function isPatchToFormalContent(doc: Document, patch: Patch): boolean {
    const path = patch.path;
    if (!(path[0] === "type" || path[0] === "theory" || path[0] === "notebook")) {
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
        // id-label mappings but don't re-elaborate the diagram!
    }
    return true;
}

const makeLiveDiagram = (
    liveDoc: LiveDoc<DiagramDocument>,
    getEntry: Accessor<DiagramEntry | undefined>,
): LiveDiagramDoc => ({
    type: "diagram",
    liveDoc,
    theory() {
        return getEntry()?.theory;
    },
    elaboratedDiagram() {
        const entry = getEntry();
        if (entry && entry.validatedDiagram.tag !== "Illformed") {
            return entry.validatedDiagram.diagram;
        }
    },
    validatedDiagram() {
        return getEntry()?.validatedDiagram;
    },
});
