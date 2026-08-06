import { v7 } from "uuid";

import type {
    Analysis,
    AnalysisType,
    Cell,
    DiagramJudgment,
    FieldValue,
    Document,
    Link,
    Modality,
    ModelJudgment,
    Mor,
    MorType,
    Ob,
    SpecializeModel,
    Table,
    TableRow,
} from "catcolab-document-types";
import {
    type DblModel,
    type DblModelDiagram,
    type DblTheory,
    elaborateDiagram,
    type InvalidDblModel,
    type MorGenerator,
    type ObGenerator,
} from "catlog-wasm";
import { type AnalysisDocument, newAnalysisCell, newAnalysisDocument } from "./analysis";
import {
    type DiagramDocument,
    duplicateDiagramJudgment,
    newDiagramDocument,
    newDiagramMorphismDecl,
    newDiagramObjectDecl,
} from "./diagram";
import { encodeCellValue, type InstanceDocument, newInstanceDocument, newTable } from "./instance";
import { formalCellsSignature, modelCacheFor, validateModelCached } from "./model-cache";
import {
    duplicateModelJudgment,
    type ModelDocument,
    newEquationDecl,
    newInstantiatedModel,
    newModelDocument,
    newMorphismDecl,
    newObjectDecl,
} from "./model-document";
import { duplicateCell, newFormalCell, newRichTextCell, type RichTextContent } from "./notebook";
import { createValidationObserver } from "./observe";
import {
    type AnalysisCell,
    type AnalysisCellsOf,
    type AnalysisDef,
    type AnalysisDefOf,
    type AnalysisShape,
    type AddCapability,
    type AnyShape,
    type AspectCell,
    type AspectDef,
    CellKind,
    type CodOf,
    type CoreTheoryLoader,
    type CreatableShape,
    type DeclaredTypes,
    type DeclaresMorphism,
    type DeclaresObject,
    type DiagramCell,
    type DiagramShape,
    type DiagramValidationResult,
    defineObject,
    type DomOf,
    encodeEndpoint,
    encodeObjectRef,
    endpointApplyOp,
    endpointListModality,
    type HasAnalyses,
    type HasCoreTheory,
    type HasDiagram,
    type IndividualCell,
    type IndividualDef,
    type InstanceShape,
    type InstantiationArgs,
    type InstantiationCell,
    type InstantiationSpecialization,
    type InstantiationType,
    type HasPathEquations,
    isAnalysisShape,
    isDiagramShape,
    isInstantiationType,
    isPathEquationType,
    isRichTextType,
    type ModelValidationResult,
    type PathEquationArgs,
    type PathEquationCell,
    type PathEquationType,
    type MorEndpointMeta,
    type MorphismCell,
    type MorphismDef,
    type MorphismShapeBound,
    type NotebookCell,
    type ObjectCell,
    type ObjectDef,
    type ObjectShapeBound,
    type RichTextCell,
    type RichTextType,
    type Reorder,
    type ParamsOf,
    type OutputOf,
    resolveCoreTheory,
    sameTypeValue,
    type ShapeAddCapability,
    type ShapeCellsOf,
    type ShapeMorphisms,
    type ShapeObjects,
    type Update,
    type ValidatableNotebook,
    type ValidatedModel,
} from "./shape";
import {
    type Commit,
    type DocumentRef,
    type DocumentStore,
    linkFromRef,
    plainDocumentId,
    plainStore,
    refFromLink,
    resolveModelInStore,
} from "./store";
import {
    type Issue,
    type Result,
    validateAddArgs,
    validatePathEquationAddArgs,
    validatePathEquationUpdateArgs,
    validateUpdateArgs,
    ValidationError,
} from "./validation";

/**
 * Internal marker under which every attached notebook records the {@link Shape}
 * it was created from. {@link Binder.createInstance} reads it back off a schema
 * notebook to obtain that notebook's derived `.Instance` shape without the caller
 * having to pass the shape again. It is a symbol so it never collides with a
 * document field. The same value is also exposed through the non-enumerable
 * public `shape` property for generic consumers.
 */
const shapeMarker: unique symbol = Symbol("originatingShape");

/** Stamp the originating shape onto a notebook and return it. */
const withShape = <N extends object>(notebook: N, shape: AnyShape): N => {
    Object.defineProperty(notebook, shapeMarker, {
        value: shape,
        enumerable: false,
        writable: false,
        configurable: true,
    });
    Object.defineProperty(notebook, "shape", {
        value: shape,
        enumerable: false,
        writable: false,
        configurable: true,
    });
    return notebook;
};

/** Read back the originating shape stamped by {@link withShape}, if present. */
const shapeOf = (notebook: object): AnyShape | undefined =>
    (notebook as { [shapeMarker]?: AnyShape })[shapeMarker];

/**
 * A notebook transaction, opened with `beginTransaction()`: the same surface as
 * the notebook it was opened on — reads, `add`, cell/row mutations all work —
 * but attached over a private store *draft* of the document, so nothing is
 * visible on the source notebook until {@link Transaction.commit}
 * merges the draft back.
 */
export type Transaction<N> = N & {
    /**
     * Merge the draft back into the source document, returning the
     * {@link Commit} that undoes the whole transaction when passed to
     * `revertCommit`. One-shot: the transaction (and its draft) is dead
     * afterwards, and committing again throws.
     */
    commit(): Commit<unknown>;
};

/**
 * The `beginTransaction`/`revertCommit` pair shared by every notebook flavor. A
 * transaction is built by cloning the document into a store draft (see
 * {@link DocumentStore.createDraft}) and re-attaching the same notebook flavor
 * over the draft handle (`reattach`), so the transaction *is* a notebook — no
 * mutation buffering, just a second handle. `commit()` merges the
 * draft back through {@link DocumentStore.commitDraft} and `revertCommit` undoes
 * a commit through {@link DocumentStore.revertCommit}. Both throw when the store
 * omits the optional draft methods (e.g. a bare Solid store).
 */
const transactionMethods = <Handle, N extends object>(
    store: DocumentStore<Handle>,
    handle: Handle,
    reattach: (draft: Handle) => N,
) => ({
    beginTransaction(): Transaction<N> {
        const { createDraft, commitDraft } = store;
        if (!createDraft || !commitDraft) {
            throw new Error(
                "This notebook's store does not support transactions: it does not " +
                    "implement `createDraft`/`commitDraft`.",
            );
        }
        const draft = createDraft.call(store, handle);
        const tx = reattach(draft);
        let committed = false;
        Object.defineProperty(tx, "commit", {
            value: (): Commit<unknown> => {
                if (committed) {
                    throw new Error("This transaction has already been committed.");
                }
                committed = true;
                return commitDraft.call(store, handle, draft);
            },
            enumerable: false,
        });
        return tx as Transaction<N>;
    },
    revertCommit(commit: Commit<unknown>): void {
        const { revertCommit } = store;
        if (!revertCommit) {
            throw new Error(
                "This notebook's store does not support reverting commits: it does " +
                    "not implement `revertCommit`.",
            );
        }
        revertCommit.call(store, handle, commit);
    },
});

/** A stable key over an issue list, for {@link Notebook.onValidate}'s
 * equivalence check on `Err` results. */
const issuesKey = (issues: ReadonlyArray<Issue>): string =>
    issues.map((issue) => `${String(issue.path?.[0] ?? "")}\u0000${issue.message}`).join("\u0001");

/**
 * Whether two model validation results would render identically, for
 * {@link Notebook.onValidate}'s delivery gate. `Ok` results compare by model
 * *identity* — safe because the elaboration cache returns the same model object
 * until the underlying content actually changes — and `Err` results by their
 * issues' paths and messages.
 */
const sameModelValidation = <TShape extends AnyShape>(
    a: ModelValidationResult<TShape>,
    b: ModelValidationResult<TShape>,
): boolean =>
    a.tag === "Ok"
        ? b.tag === "Ok" && a.content === b.content
        : b.tag === "Err" && issuesKey(a.content) === issuesKey(b.content);

/** Add the shape-aware query surface to a validated WASM model in place. */
function asValidatedModel<TShape extends AnyShape>(model: DblModel): ValidatedModel<TShape> {
    const existing = model as ValidatedModel<TShape>;
    if (typeof existing.judgmentsOf === "function" && typeof existing.get === "function") {
        return existing;
    }

    const judgmentsOf = (type: ObjectDef | MorphismDef) => {
        if (type.tag === "object") {
            return model.obGeneratorsWithType(type.obType).map((id) => model.obPresentation(id));
        }
        return model.morGeneratorsWithType(type.morType).flatMap((id) => {
            const judgment = model.morPresentation(id);
            return judgment ? [judgment] : [];
        });
    };

    const get = (type: ObjectDef | MorphismDef, id: string): Result<unknown> => {
        const judgment = judgmentsOf(type).find((candidate) => candidate.id === id);
        if (judgment) {
            return { tag: "Ok", content: judgment };
        }
        const exists = model.obGenerators().includes(id) || model.morGenerators().includes(id);
        return {
            tag: "Err",
            content: [
                exists
                    ? { message: `Judgment "${id}" is not of the expected type.`, path: ["id"] }
                    : { message: `No judgment with id "${id}".`, path: ["id"] },
            ],
        };
    };

    Object.defineProperties(model, {
        judgmentsOf: { value: judgmentsOf },
        get: { value: get },
    });
    return model as ValidatedModel<TShape>;
}

/**
 * A diagram/instance validation outcome together with what it was computed
 * from, so {@link sameDiagramValidation} can decide equivalence: the elaborated
 * diagram is a fresh object every run, so the result alone cannot say whether
 * anything changed — the host model's identity (stable via the elaboration
 * cache) and the notebook's own formal-content signature stand in for it.
 */
type DiagramValidationSnapshot = {
    result: DiagramValidationResult;
    model: DblModel | undefined;
    ownSignature: string;
};

/** A stable key over a diagram validation's failure content. */
const diagramErrorsKey = (result: DiagramValidationResult): string => {
    switch (result.tag) {
        case "Illformed":
            return result.error;
        case "Invalid":
            return JSON.stringify(result.errors);
        default:
            return "";
    }
};

/** Whether two diagram/instance validation snapshots would render identically;
 * see {@link DiagramValidationSnapshot}. */
const sameDiagramValidation = (
    a: DiagramValidationSnapshot,
    b: DiagramValidationSnapshot,
): boolean =>
    a.result.tag === b.result.tag &&
    a.model === b.model &&
    a.ownSignature === b.ownSignature &&
    diagramErrorsKey(a.result) === diagramErrorsKey(b.result);

/**
 * Convert an {@link InvalidDblModel} validation error into a
 * [Standard Schema](https://standardschema.dev) {@link Issue}. The failing
 * generator's qualified name (when the error carries one) becomes the issue's
 * `path`, and a legible description of the error tag its `message`, so callers
 * inspect model validation failures the same vendor-neutral way as `add`/`get`
 * failures.
 */
const modelErrorToIssue = (error: InvalidDblModel): Issue => {
    switch (error.tag) {
        case "Dom":
            return {
                message: `Morphism "${error.content}" has an invalid domain`,
                path: [error.content],
            };
        case "Cod":
            return {
                message: `Morphism "${error.content}" has an invalid codomain`,
                path: [error.content],
            };
        case "ObType":
            return {
                message: `Object "${error.content}" has an invalid type`,
                path: [error.content],
            };
        case "MorType":
            return {
                message: `Morphism "${error.content}" has an invalid type`,
                path: [error.content],
            };
        case "DomType":
            return {
                message: `Morphism "${error.content}" has an invalid domain type`,
                path: [error.content],
            };
        case "CodType":
            return {
                message: `Morphism "${error.content}" has an invalid codomain type`,
                path: [error.content],
            };
        case "Eqn":
            return { message: "An equation is invalid" };
        case "UnsupportedFeature":
            return { message: `Unsupported feature: ${error.content.tag}` };
        case "InvalidLink":
            return {
                message: `Object "${error.content}" has an invalid link`,
                path: [error.content],
            };
    }
};

/**
 * Drop the endpoint `obType` metadata from a morphism def's `domain`/`codomain`.
 * That field is only an *expectation* used to validate `add` (see
 * `defineMorphism`); it is not part of what the document stores, so a def
 * reconstructed from storage in `cells()` cannot recover it for a `Basic`
 * morphism. {@link sameMorphismType} compares on the rest (the `morType` and
 * each endpoint's `apply`/`modality`), which keeps `cellsOf`/`supports`
 * selecting the right cells regardless of the recorded `obType`.
 */
const stripObTypeFromMeta = (meta: MorEndpointMeta | undefined): MorEndpointMeta | undefined => {
    if (!meta) {
        return undefined;
    }
    const { obType: _obType, ...rest } = meta;
    return Object.keys(rest).length > 0 ? rest : undefined;
};

const stripEndpointObType = (def: MorphismDef): MorphismDef => ({
    ...def,
    domain: stripObTypeFromMeta(def.domain),
    codomain: stripObTypeFromMeta(def.codomain),
});

/** Structural equality of two morphism defs ignoring endpoint `obType`. */
const sameMorphismType = (a: MorphismDef, b: MorphismDef): boolean =>
    sameTypeValue(stripEndpointObType(a), stripEndpointObType(b));

/**
 * The rich-text updater shared by every notebook flavor's rich-text cell
 * handle. A content update replaces the cell's fields through the notebook's
 * generic `change`. This is replace-only by design: incremental rich-text
 * editing does not go through the notebook handle at all — an editor binds
 * directly to the store via {@link DocumentStore.getRichTextRef}.
 */
const makeRichTextUpdater =
    (
        change: (
            fn: (doc: { notebook: { cellContents: Record<string, unknown> } }) => void,
        ) => void,
    ) =>
    (cellId: string, u: { content?: RichTextContent }) => {
        change((d) => {
            Object.assign(d.notebook.cellContents[cellId] as object, u);
        });
    };

/**
 * Attach an analysis notebook over a real {@link AnalysisDocument} held by the
 * store. Cells are stored as {@link Analysis} formal cells (`{ id, content }`),
 * coexisting with rich-text cells. Each {@link AnalysisCell.run} resolves the
 * analyzed model from the document's `analysisOf` link through the store, then
 * delegates to the analysis def's `run`.
 */
function attachAnalysisNotebook<TShape extends AnalysisShape, Handle>(
    store: DocumentStore<Handle>,
    handle: Handle,
    shape: TShape,
): Notebook<TShape, Handle> {
    const doc = store.getDocumentView(handle) as AnalysisDocument;
    const change = (fn: (doc: AnalysisDocument) => void) =>
        store.changeDocument(handle, fn as (doc: Document) => void);

    const changeRichText = makeRichTextUpdater(change);

    /** The analysis def for a given id, looked up in the shape's `analyses`. */
    const defForId = (id: string): AnalysisDef | undefined =>
        (shape.analyses ?? []).find((def) => def.id === id);

    const readCell = (cellId: string): Cell<Analysis> | undefined =>
        doc.notebook.cellContents[cellId] as Cell<Analysis> | undefined;

    /**
     * Read an analysis cell's stored params, or `{}` if missing/non-formal.
     *
     * This is the single untyped boundary of the analysis notebook: the
     * persisted `Analysis.content` is a bare `Record<string, Value>` that carries
     * no link back to the `Def` whose `params` it holds, so recovering the
     * `ParamsOf<Def>` view here is an unchecked cast. Every typed handle reads its
     * params through this one function, so no other cast is needed downstream.
     */
    const readParams = <Def extends AnalysisDef>(cellId: string): ParamsOf<Def> => {
        const cell = readCell(cellId);
        if (cell?.tag !== "formal") {
            return {} as ParamsOf<Def>;
        }
        return cell.content.content as ParamsOf<Def>;
    };

    const moveCell = (cellId: string, target: (from: number) => number) =>
        change((d) => {
            const order = d.notebook.cellOrder;
            const from = order.indexOf(cellId);
            if (from < 0) {
                return;
            }
            const to = Math.max(0, Math.min(target(from), order.length - 1));
            if (to === from) {
                return;
            }
            order.splice(from, 1);
            order.splice(to, 0, cellId);
        });

    const deleteCell = (cellId: string) =>
        change((d) => {
            const order = d.notebook.cellOrder;
            const from = order.indexOf(cellId);
            if (from < 0) {
                return;
            }
            order.splice(from, 1);
            delete d.notebook.cellContents[cellId];
        });

    const reorderMethods = (cellId: string): Reorder => ({
        moveUp: () => moveCell(cellId, (from) => from - 1),
        moveDown: () => moveCell(cellId, (from) => from + 1),
        moveTo: (index: number) => moveCell(cellId, () => index),
        delete: () => deleteCell(cellId),
    });

    const richTextHandle = (cellId: string): RichTextCell =>
        ({
            kind: CellKind.RichText,
            id: cellId,
            get content() {
                return (readCell(cellId) as { content?: RichTextContent } | undefined)?.content;
            },
            get editorRef() {
                return store.getRichTextRef?.(handle, cellId);
            },
            update(u: { content?: RichTextContent }) {
                changeRichText(cellId, u);
            },
            ...reorderMethods(cellId),
        }) as unknown as RichTextCell;

    const analysisHandle = <Def extends AnalysisDef>(
        cellId: string,
        def: Def,
    ): AnalysisCell<Def> => {
        const handle: AnalysisCell<Def> = {
            kind: CellKind.Analysis,
            get id() {
                return cellId;
            },
            type: def,
            get params() {
                return readParams<Def>(cellId);
            },
            update(partial: Partial<ParamsOf<Def>>) {
                change((d) => {
                    const cell = d.notebook.cellContents[cellId] as Cell<Analysis> | undefined;
                    if (cell?.tag === "formal") {
                        Object.assign(cell.content.content, partial);
                    }
                });
            },
            async run(): Promise<Result<OutputOf<Def>>> {
                const params = readParams<Def>(cellId);
                const coreTheory = await resolveCoreTheory({
                    getCoreTheory: shape.analysisOfCoreTheory,
                });
                if (!coreTheory) {
                    return {
                        tag: "Err",
                        content: [
                            {
                                message:
                                    "run() needs the analyzed model's core theory: this " +
                                    "analysis shape has no `analysisOfCoreTheory`.",
                            },
                        ],
                    };
                }
                try {
                    const model = await resolveModelInStore(
                        store,
                        refFromLink(doc.analysisOf),
                        coreTheory,
                    );
                    // `def.run` is only known to return `Promise<Output>` up to the
                    // `AnalysisDef` constraint, where `Output` defaults to `unknown`;
                    // recover the precise `OutputOf<Def>` at this boundary so the
                    // `Ok` content matches the handle's declared `Result<OutputOf<Def>>`.
                    const content = (await def.run(model, params)) as OutputOf<Def>;
                    return { tag: "Ok", content };
                } catch (error) {
                    return {
                        tag: "Err",
                        content: [
                            { message: error instanceof Error ? error.message : String(error) },
                        ],
                    };
                }
            },
            ...reorderMethods(cellId),
        };
        return handle;
    };

    const impl = {
        // A transaction re-attaches this same analysis flavor over a store
        // draft (via the `attachNotebook` dispatcher, so the draft notebook is
        // shape-stamped like the original).
        ...transactionMethods(store, handle, (draft) => attachNotebook(store, draft, shape)),
        get title() {
            return doc.name;
        },
        handle,
        get document() {
            return doc;
        },
        get analysisType(): AnalysisType {
            return doc.analysisType;
        },
        dump() {
            return store.copyValue(handle, doc);
        },
        update(u: { title?: string }) {
            change((d) => {
                if (u.title !== undefined) {
                    d.name = u.title;
                }
            });
        },
        onChange(callback: () => void): () => void {
            return store.subscribe(handle, callback);
        },
        onChangeFormalContent(callback: () => void): () => void {
            const signature = () => formalCellsSignature(doc);
            let previous = signature();
            return impl.onChange(() => {
                const next = signature();
                if (next !== previous) {
                    previous = next;
                    callback();
                }
            });
        },
        add(type: unknown, args?: { content?: RichTextContent }) {
            if (isRichTextType(type)) {
                const cell = newRichTextCell((args as { content?: RichTextContent })?.content);
                change((d) => {
                    d.notebook.cellContents[cell.id] = cell as unknown as Cell<Analysis>;
                    d.notebook.cellOrder.push(cell.id);
                });
                return richTextHandle(cell.id);
            }
            const def = type as AnalysisDef;
            const cell = newFormalCell(
                newAnalysisCell(def.id, def.getInitialParams() as Record<string, unknown>),
            );
            change((d) => {
                d.notebook.cellContents[cell.id] = cell;
                d.notebook.cellOrder.push(cell.id);
            });
            return analysisHandle(cell.id, def);
        },
        cells(): Array<RichTextCell | AnalysisCell> {
            return doc.notebook.cellOrder.map((cellId) => {
                const cell = doc.notebook.cellContents[cellId];
                if (!cell) {
                    throw new Error(`Failed to find notebook cell contents for cell '${cellId}'`);
                }
                if (cell.tag === "rich-text") {
                    return richTextHandle(cellId);
                }
                const content = cell.content;
                const def = defForId(content.id);
                if (!def) {
                    throw new Error(`No analysis declared for id '${content.id}'.`);
                }
                return analysisHandle(cellId, def);
            });
        },
        formalCells(): Array<AnalysisCell> {
            return impl
                .cells()
                .filter((cell) => cell.kind !== CellKind.RichText) as Array<AnalysisCell>;
        },
        cellsOf(arg: RichTextType | AnalysisDef): Array<RichTextCell | AnalysisCell> {
            if (isRichTextType(arg)) {
                return impl.cells().filter((cell) => cell.kind === CellKind.RichText);
            }
            return impl
                .cells()
                .filter((cell) => cell.kind === CellKind.Analysis && cell.type.id === arg.id);
        },
    };

    const notebook = impl as unknown as Notebook<TShape, Handle>;

    if ((store as DocumentStore<unknown>) === plainStore) {
        plainDocumentId(handle as Document);
    }

    return notebook;
}

/**
 * Attach a diagram notebook over a real {@link DiagramDocument} held by the
 * store. Cells are stored as {@link DiagramJudgment} formal cells — objects and
 * morphisms drawn `over` the cells of the model the diagram is in — coexisting
 * with rich-text cells. The model is referenced by the document's `diagramIn`
 * link and read through the store, so endpoint and `over` handles resolve to the
 * model's own object/morphism cells. {@link Notebook.validate} resolves and
 * elaborates the model, elaborates the diagram against the model's core theory,
 * and validates the diagram in the model.
 */
function attachDiagramNotebook<TShape extends DiagramShape, Handle>(
    store: DocumentStore<Handle>,
    handle: Handle,
    shape: TShape,
    modelHandle: Handle,
): Notebook<TShape, Handle> {
    const doc = store.getDocumentView(handle) as DiagramDocument;
    const change = (fn: (doc: DiagramDocument) => void) =>
        store.changeDocument(handle, fn as (doc: Document) => void);
    const copy = <T>(value: T): T => store.copyValue(handle, value);
    const isPlainStore = (store as DocumentStore<unknown>) === plainStore;

    const changeRichText = makeRichTextUpdater(change);

    /**
     * The model document the diagram is drawn in. The model handle is threaded
     * in from `createNotebook`'s `in` notebook (the diagram's only construction
     * path), so the diagram reads the model directly and synchronously — no
     * `getHandle` round-trip is needed for reactive reads, since the caller
     * already holds the model it is drawing in.
     */
    const modelDocument = (): ModelDocument => store.getDocumentView(modelHandle) as ModelDocument;

    /** Read a model judgment by its generator id from the model document. */
    const modelJudgment = (id: string): ModelJudgment | undefined => {
        const model = modelDocument();
        for (const cellId of model.notebook.cellOrder) {
            const cell = model.notebook.cellContents[cellId];
            if (cell?.tag === "formal" && (cell.content as ModelJudgment).id === id) {
                return cell.content as ModelJudgment;
            }
        }
        return undefined;
    };

    /** A read-only handle for the model object a diagram individual is over. */
    const modelObjectHandle = (id: string): ObjectCell => {
        const judgment = modelJudgment(id);
        const obType =
            judgment?.tag === "object" ? judgment.obType : { tag: "Basic" as const, content: "" };
        return {
            kind: CellKind.Object,
            id,
            type: defineObject(obType),
            get label() {
                const current = modelJudgment(id);
                return current?.tag === "object" ? current.name : undefined;
            },
        } as unknown as ObjectCell;
    };

    /** A read-only handle for the model morphism a diagram aspect is over. */
    const modelMorphismHandle = (id: string): MorphismCell => {
        return {
            kind: CellKind.Morphism,
            id,
            get label() {
                const current = modelJudgment(id);
                return current?.tag === "morphism" ? current.name : undefined;
            },
        } as unknown as MorphismCell;
    };

    const readCellContent = <T>(cellId: string): T | undefined => {
        const cell = doc.notebook.cellContents[cellId];
        if (!cell) {
            return undefined;
        }
        return (cell as unknown as { content: T }).content;
    };

    const moveCell = (cellId: string, target: (from: number) => number) =>
        change((d) => {
            const order = d.notebook.cellOrder;
            const from = order.indexOf(cellId);
            if (from < 0) {
                return;
            }
            const to = Math.max(0, Math.min(target(from), order.length - 1));
            if (to === from) {
                return;
            }
            order.splice(from, 1);
            order.splice(to, 0, cellId);
        });

    const deleteCell = (cellId: string) =>
        change((d) => {
            const order = d.notebook.cellOrder;
            const from = order.indexOf(cellId);
            if (from < 0) {
                return;
            }
            order.splice(from, 1);
            delete d.notebook.cellContents[cellId];
        });

    const reorderMethods = (cellId: string): Reorder => ({
        moveUp: () => moveCell(cellId, (from) => from - 1),
        moveDown: () => moveCell(cellId, (from) => from + 1),
        moveTo: (index: number) => moveCell(cellId, () => index),
        delete: () => deleteCell(cellId),
    });

    const appendDuplicate = (cellId: string): string => {
        const cell = doc.notebook.cellContents[cellId];
        if (!cell || cell.tag !== "formal") {
            throw new Error(`Cannot duplicate cell '${cellId}'.`);
        }
        const duplicated = newFormalCell(
            duplicateDiagramJudgment(copy(cell.content as DiagramJudgment)),
        );
        change((d) => {
            d.notebook.cellContents[duplicated.id] = duplicated as unknown as Cell<DiagramJudgment>;
            d.notebook.cellOrder.push(duplicated.id);
        });
        return duplicated.id;
    };

    /** Resolve a stored endpoint `Ob` to the diagram individual cell it names. */
    const individualForId = (id: string): IndividualCell => {
        for (const cellId of doc.notebook.cellOrder) {
            const cell = doc.notebook.cellContents[cellId];
            if (cell?.tag !== "formal") {
                continue;
            }
            const judgment = cell.content as DiagramJudgment;
            if (judgment.tag === "object" && judgment.id === id) {
                return individualHandle(cellId, shape.Individual);
            }
        }
        throw new Error(`No individual cell found for endpoint '${id}'.`);
    };

    const decodeIndividualEndpoint = (ob: Ob | null): IndividualCell | undefined =>
        ob?.tag === "Basic" ? individualForId(ob.content) : undefined;

    const individualHandle = <Def extends IndividualDef>(
        cellId: string,
        type: Def,
    ): IndividualCell<Def> =>
        ({
            kind: CellKind.Object,
            get id() {
                return readCellContent<{ id: string }>(cellId)?.id;
            },
            type,
            get label() {
                return readCellContent<{ name: string }>(cellId)?.name;
            },
            get over() {
                const over = readCellContent<{ over: Ob | null }>(cellId)?.over;
                return over?.tag === "Basic" ? modelObjectHandle(over.content) : undefined;
            },
            update(u: { label?: string; over?: { id: string } }) {
                change((d) => {
                    const content = (
                        d.notebook.cellContents[cellId] as {
                            content: { name: string; over: Ob | null };
                        }
                    ).content;
                    if (u.label !== undefined) {
                        content.name = u.label;
                    }
                    if ("over" in u) {
                        content.over = u.over ? encodeObjectRef(u.over) : null;
                    }
                });
            },
            duplicate() {
                return individualHandle(appendDuplicate(cellId), type);
            },
            ...reorderMethods(cellId),
        }) as unknown as IndividualCell<Def>;

    const aspectHandle = <Def extends AspectDef>(cellId: string, type: Def): AspectCell<Def> =>
        ({
            kind: CellKind.Morphism,
            get id() {
                return readCellContent<{ id: string }>(cellId)?.id;
            },
            type,
            get label() {
                return readCellContent<{ name: string }>(cellId)?.name;
            },
            get from() {
                return decodeIndividualEndpoint(
                    readCellContent<{ dom: Ob | null }>(cellId)?.dom ?? null,
                );
            },
            get to() {
                return decodeIndividualEndpoint(
                    readCellContent<{ cod: Ob | null }>(cellId)?.cod ?? null,
                );
            },
            get over() {
                const over = readCellContent<{ over: Mor | null }>(cellId)?.over;
                return over?.tag === "Basic" ? modelMorphismHandle(over.content) : undefined;
            },
            update(u: {
                label?: string;
                from?: { id: string };
                to?: { id: string };
                over?: { id: string };
            }) {
                change((d) => {
                    const content = (
                        d.notebook.cellContents[cellId] as {
                            content: {
                                name: string;
                                dom: Ob | null;
                                cod: Ob | null;
                                over: Mor | null;
                            };
                        }
                    ).content;
                    if (u.label !== undefined) {
                        content.name = u.label;
                    }
                    if ("from" in u) {
                        content.dom = u.from ? encodeObjectRef(u.from) : null;
                    }
                    if ("to" in u) {
                        content.cod = u.to ? encodeObjectRef(u.to) : null;
                    }
                    if ("over" in u) {
                        content.over = u.over ? { tag: "Basic", content: u.over.id } : null;
                    }
                });
            },
            duplicate() {
                return aspectHandle(appendDuplicate(cellId), type);
            },
            ...reorderMethods(cellId),
        }) as unknown as AspectCell<Def>;

    const richTextHandle = (cellId: string): RichTextCell =>
        ({
            kind: CellKind.RichText,
            id: cellId,
            get content() {
                return readCellContent<RichTextContent>(cellId);
            },
            get editorRef() {
                return store.getRichTextRef?.(handle, cellId);
            },
            update(u: { content?: RichTextContent }) {
                changeRichText(cellId, u);
            },
            ...reorderMethods(cellId),
        }) as unknown as RichTextCell;

    const impl = {
        // A transaction re-attaches this same diagram flavor over a store
        // draft; the host *model* handle is shared, not cloned.
        ...transactionMethods(store, handle, (draft) =>
            attachNotebook(store, draft, shape, modelHandle),
        ),
        get title() {
            return doc.name;
        },
        get theory() {
            return shape.theory;
        },
        handle,
        get document() {
            return doc;
        },
        dump() {
            return copy(doc);
        },
        update(u: { title?: string }) {
            change((d) => {
                if (u.title !== undefined) {
                    d.name = u.title;
                }
            });
        },
        onChange(callback: () => void): () => void {
            return store.subscribe(handle, callback);
        },
        onChangeFormalContent(callback: () => void): () => void {
            const signature = () => formalCellsSignature(doc);
            let previous = signature();
            return impl.onChange(() => {
                const next = signature();
                if (next !== previous) {
                    previous = next;
                    callback();
                }
            });
        },
        add(
            type: unknown,
            args: {
                content?: RichTextContent;
                label?: string;
                over?: { id: string };
                from?: { id: string };
                to?: { id: string };
            },
        ) {
            if (isRichTextType(type)) {
                const cell = newRichTextCell((args as { content?: RichTextContent })?.content);
                change((d) => {
                    d.notebook.cellContents[cell.id] = cell as unknown as Cell<DiagramJudgment>;
                    d.notebook.cellOrder.push(cell.id);
                });
                return richTextHandle(cell.id);
            }
            const def = type as IndividualDef | AspectDef;
            if (def.tag === "individual") {
                const judgment = newDiagramObjectDecl(
                    def.obType,
                    args.over ? encodeObjectRef(args.over) : null,
                );
                judgment.name = args.label ?? "";
                const formalCell = newFormalCell(judgment);
                change((d) => {
                    d.notebook.cellContents[formalCell.id] = formalCell;
                    d.notebook.cellOrder.push(formalCell.id);
                });
                return individualHandle(formalCell.id, def);
            }
            const judgment = newDiagramMorphismDecl(
                def.morType,
                args.over ? { tag: "Basic", content: args.over.id } : null,
            );
            judgment.name = args.label ?? "";
            judgment.dom = args.from ? encodeObjectRef(args.from) : null;
            judgment.cod = args.to ? encodeObjectRef(args.to) : null;
            const formalCell = newFormalCell(judgment);
            change((d) => {
                d.notebook.cellContents[formalCell.id] = formalCell;
                d.notebook.cellOrder.push(formalCell.id);
            });
            return aspectHandle(formalCell.id, def);
        },
        cells(): Array<DiagramCell> {
            return doc.notebook.cellOrder.map((cellId) => {
                const cell = doc.notebook.cellContents[cellId];
                if (!cell) {
                    throw new Error(`Failed to find notebook cell contents for cell '${cellId}'`);
                }
                if (cell.tag === "rich-text") {
                    return richTextHandle(cellId);
                }
                const judgment = cell.content as DiagramJudgment;
                switch (judgment.tag) {
                    case "object":
                        return individualHandle(cellId, shape.Individual);
                    case "morphism":
                        return aspectHandle(
                            cellId,
                            shape.Aspect ??
                                ({
                                    tag: "aspect",
                                    morphism: { tag: "morphism", morType: judgment.morType },
                                    morType: judgment.morType,
                                } satisfies AspectDef),
                        );
                    default:
                        throw new Error(`Unsupported diagram judgment tag: ${judgment.tag}`);
                }
            });
        },
        formalCells(): Array<Exclude<DiagramCell, RichTextCell>> {
            return impl.cells().filter((cell) => cell.kind !== CellKind.RichText) as Array<
                Exclude<DiagramCell, RichTextCell>
            >;
        },
        async validate(): Promise<DiagramValidationResult> {
            return (await runValidation()).result;
        },
        onValidate(callback: (result: DiagramValidationResult) => void): () => void {
            return createValidationObserver<DiagramValidationSnapshot>({
                validate: async () => ({
                    ...(await runValidation()),
                    ownSignature: formalCellsSignature(doc),
                }),
                cache: modelCacheFor(store),
                depRootId: doc.diagramIn._id,
                subscribeOwn: (cb) => impl.onChangeFormalContent(cb),
                equivalent: sameDiagramValidation,
                deliver: (snapshot) => callback(snapshot.result),
            });
        },
    };

    /**
     * One validation run, also reporting the host model it validated in (when
     * resolution succeeded): {@link Notebook.onValidate} compares that model's
     * identity across runs, which the {@link DiagramValidationResult} alone
     * cannot provide.
     */
    const runValidation = async (): Promise<{
        result: DiagramValidationResult;
        model: DblModel | undefined;
    }> => {
        const coreTheory = await resolveCoreTheory({
            getCoreTheory: shape.diagramInCoreTheory,
        });
        if (!coreTheory) {
            throw new Error(
                "validate() needs the model's core theory: this diagram shape has " +
                    "no `diagramInCoreTheory`.",
            );
        }
        let model: DblModel;
        try {
            model = await resolveModelInStore(store, refFromLink(doc.diagramIn), coreTheory);
        } catch (e) {
            return {
                result: { tag: "Illformed", diagram: null, error: String(e) },
                model: undefined,
            };
        }
        let diagram: DblModelDiagram;
        try {
            const judgments = doc.notebook.cellOrder.flatMap((cellId) => {
                const cell = doc.notebook.cellContents[cellId];
                return cell?.tag === "formal" ? [cell.content as DiagramJudgment] : [];
            });
            diagram = elaborateDiagram(judgments, coreTheory);
        } catch (e) {
            return { result: { tag: "Illformed", diagram: null, error: String(e) }, model };
        }
        diagram.inferMissingFrom(model);
        const result = diagram.validateIn(model);
        if (result.tag === "Ok") {
            return { result: { tag: "Valid", diagram }, model };
        }
        return { result: { tag: "Invalid", diagram, errors: result.content }, model };
    };

    const notebook = impl as unknown as Notebook<TShape, Handle>;

    if (isPlainStore) {
        plainDocumentId(handle as Document);
    }

    return notebook;
}

/** The generator id referenced by a `Basic` endpoint object, if any. */
const obRefId = (ob: Ob | null): string | undefined =>
    ob?.tag === "Basic" ? ob.content : undefined;

const modelHasObject = (model: DblModel, id: string): boolean => {
    try {
        return model.hasOb({ tag: "Basic", content: id });
    } catch {
        return false;
    }
};

const modelHasMorphism = (model: DblModel, id: string): boolean => {
    try {
        return model.hasMor({ tag: "Basic", content: id });
    } catch {
        return false;
    }
};

/** Whether a value passed as an inline instance-`add` arg is an existing row. */
const isRow = (value: unknown): value is { readonly id: string } =>
    typeof value === "object" &&
    value !== null &&
    typeof (value as { id?: unknown }).id === "string";

/** The table instantiating a schema object, if any. */
const tableFor = (d: InstanceDocument, objectId: string): Table | undefined => d.tables[objectId];

/** Locate a row and the table holding it, if the row exists. */
const findRow = (
    d: InstanceDocument,
    rowId: string,
): { table: Table; row: TableRow } | undefined => {
    for (const table of Object.values(d.tables)) {
        const row = table.rows[rowId];
        if (row) {
            return { table, row };
        }
    }
    return undefined;
};

/**
 * Attach an *instance* notebook: an ergonomic, row-oriented surface over an
 * {@link InstanceDocument}, which stores its data as an array of *tables* — one
 * per schema entity, keyed throughout by the schema's generator UUIDs (see
 * {@link InstanceDocument}).
 *
 * An instance is a database of the schema it is of: `instance.add(person, { …
 * })` inserts a *row* into the table of the schema object `person` (creating
 * that table on first use), and the inline args name the schema's outgoing
 * mappings and attributes — each writes the row's content value for that
 * morphism's UUID, wiring the row to another row (a mapping) or a literal value
 * (an attribute). Rows are never named: identity is the row's UUID and its
 * content.
 *
 * Because tables reference schema objects, and content values reference schema
 * morphisms, by UUID, the surface only ever *displays* the parts of the schema
 * still live: a deleted schema morphism's values remain in each row's content
 * but resolve to no live column, so {@link Row.values} silently omits them, and
 * a deleted schema entity's whole table is retained but hidden. Restoring the
 * generator (undo/redo/rollback) re-associates the retained data with no
 * diffing. This is the whole point of the UUID-keyed representation.
 *
 * Validation still runs through the same catlog machinery a diagram uses: the
 * tables are elaborated on the fly into the {@link DiagramJudgment}s a
 * diagram-in-model would carry, then validated in the schema model.
 */
function attachInstanceNotebook<
    TShape extends InstanceShape,
    Handle,
    TModelShape extends AnyShape = AnyShape,
>(
    store: DocumentStore<Handle>,
    handle: Handle,
    shape: TShape,
    model: ValidatableNotebook<Handle, TModelShape>,
    initialModel?: DblModel,
): Instance<TShape, Handle, TModelShape> {
    const doc = store.getDocumentView(handle) as InstanceDocument;
    const change = (fn: (doc: InstanceDocument) => void) =>
        store.changeDocument(handle, fn as (doc: Document) => void);
    const copy = <T>(value: T): T => store.copyValue(handle, value);
    const isPlainStore = (store as DocumentStore<unknown>) === plainStore;
    let elaboratedModel = initialModel;
    const objectRefs = new Map<string, ObGenerator>();
    const morphismRefs = new Map<string, MorGenerator>();

    const modelDocument = (): ModelDocument => store.getDocumentView(model.handle) as ModelDocument;
    const localObjectIds = new Set<string>();
    const localMorphismIds = new Set<string>();
    for (const cell of Object.values(modelDocument().notebook.cellContents)) {
        const judgment = cell?.tag === "formal" ? (cell.content as ModelJudgment) : undefined;
        if (judgment?.tag === "object") {
            localObjectIds.add(judgment.id);
        } else if (judgment?.tag === "morphism") {
            localMorphismIds.add(judgment.id);
        }
    }

    /** Every morphism judgment declared in the schema this instance is of. */
    const schemaMorphisms = (): Array<ModelJudgment & { tag: "morphism" }> => {
        const model = modelDocument();
        const out: Array<ModelJudgment & { tag: "morphism" }> = [];
        for (const cellId of model.notebook.cellOrder) {
            const cell = model.notebook.cellContents[cellId];
            if (cell?.tag === "formal" && (cell.content as ModelJudgment).tag === "morphism") {
                const judgment = cell.content as ModelJudgment & { tag: "morphism" };
                localMorphismIds.add(judgment.id);
                out.push(judgment);
            }
        }
        return out;
    };

    /** The schema object judgment for a generator id, if it is still live. */
    const schemaObjectJudgment = (id: string): (ModelJudgment & { tag: "object" }) | undefined => {
        const model = modelDocument();
        for (const cellId of model.notebook.cellOrder) {
            const cell = model.notebook.cellContents[cellId];
            const content = cell?.tag === "formal" ? (cell.content as ModelJudgment) : undefined;
            if (content?.tag === "object" && content.id === id) {
                localObjectIds.add(content.id);
                return content;
            }
        }
        return undefined;
    };

    const objectPresentation = (id: string): ObGenerator | undefined => {
        const local = schemaObjectJudgment(id);
        if (local) {
            return {
                id,
                label: local.name ? [local.name] : undefined,
                obType: local.obType,
            };
        }
        if (localObjectIds.has(id)) {
            return undefined;
        }
        const referenced = objectRefs.get(id);
        if (referenced) {
            return referenced;
        }
        if (elaboratedModel) {
            return modelHasObject(elaboratedModel, id)
                ? elaboratedModel.obPresentation(id)
                : undefined;
        }
        return undefined;
    };

    const morphismPresentation = (id: string): MorGenerator | undefined => {
        const local = morphismById(id);
        if (local) {
            return {
                id,
                label: local.name ? [local.name] : undefined,
                morType: local.morType,
                dom: local.dom ?? { tag: "Basic", content: "" },
                cod: local.cod ?? { tag: "Basic", content: "" },
            };
        }
        if (localMorphismIds.has(id)) {
            return undefined;
        }
        const referenced = morphismRefs.get(id);
        if (referenced) {
            return referenced;
        }
        if (elaboratedModel) {
            return modelHasMorphism(elaboratedModel, id)
                ? elaboratedModel.morPresentation(id)
                : undefined;
        }
        return undefined;
    };

    /** A read-only schema object cell handle for a schema object judgment id. */
    const schemaObjectCell = (id: string): ObjectCell => {
        const presentation = objectPresentation(id);
        const obType = presentation?.obType ?? { tag: "Basic" as const, content: "" };
        return {
            kind: CellKind.Object,
            id,
            type: defineObject(obType),
            get label() {
                return objectPresentation(id)?.label?.join(".");
            },
        } as unknown as ObjectCell;
    };

    /** The morphism named `key` whose domain is `objectId`, if any. */
    const morphismByName = (key: string, objectId: string): { readonly id: string } | undefined => {
        const local = schemaMorphisms().find((m) => m.name === key && obRefId(m.dom) === objectId);
        if (local) {
            return local;
        }
        return elaboratedModel
            ?.morGenerators()
            .map((id) => elaboratedModel?.morPresentation(id))
            .find(
                (morphism) => morphism?.label?.at(-1) === key && obRefId(morphism.dom) === objectId,
            );
    };

    /** The morphism with the given generator id, if it is still live. */
    const morphismById = (id: string): (ModelJudgment & { tag: "morphism" }) | undefined =>
        schemaMorphisms().find((m) => m.id === id);

    /** The schema object id a row is a record of, if the row exists. */
    const objectIdOfRow = (rowId: string): string | undefined => findRow(doc, rowId)?.table.id;

    /** Encode a `RowValue` as a stored field value. */
    const encodeRowValue = (value: Exclude<RowValue, undefined>): FieldValue =>
        isRow(value) ? { RowRef: value.id } : encodeCellValue(value as string | number | boolean);

    /** Decode a stored field value back into the row surface's vocabulary. */
    const decodeCellValue = (value: FieldValue): RowValue | undefined => {
        if (value === "Null") {
            return undefined;
        }
        if ("RowRef" in value) {
            return rowHandle(value.RowRef);
        }
        if ("Bool" in value) {
            return value.Bool;
        }
        if ("Int" in value) {
            return value.Int;
        }
        if ("Float" in value) {
            return value.Float;
        }
        return value.String;
    };

    /**
     * Insert a row into a schema object's table — creating that table on first
     * use — then set the inline mapping/attribute values named by `args`.
     * Returns the new row handle.
     */
    const insertRow = (object: ModelObjectRef, args?: Record<string, RowValue>): Row => {
        if ("obType" in object) {
            objectRefs.set(object.id, object as ObGenerator);
        }
        const presentation = objectPresentation(object.id);
        if (!presentation) {
            throw new Error(
                `Cannot add a row for judgment "${object.id}": it is not a known model object.`,
            );
        }
        if (
            !shape.tableObjects.some((definition) =>
                sameTypeValue(definition, defineObject(presentation.obType)),
            )
        ) {
            throw new Error(
                `Cannot add a row for judgment "${object.id}": its object type does not ` +
                    "support instance rows.",
            );
        }
        const rowId = v7();
        change((d) => {
            let table = tableFor(d, object.id);
            if (!table) {
                d.tables[object.id] = newTable(object.id);
                // Re-read the table off the draft: an Automerge store *copies*
                // the assigned object into the document, so mutating the original
                // would be lost.
                table = tableFor(d, object.id) as Table;
            }
            table.rows[rowId] = { id: rowId, fields: {} };
            table.row_order.push(rowId);
        });
        const handle = rowHandle(rowId);
        for (const [key, value] of Object.entries(args ?? {})) {
            if (value === undefined) {
                continue;
            }
            const morphism = morphismByName(key, object.id);
            if (!morphism) {
                const name = presentation.label?.join(".") ?? object.id;
                throw new Error(
                    `No mapping or attribute named "${key}" on schema object "${name}".`,
                );
            }
            handle.set(morphism, value);
        }
        return handle;
    };

    /** Set (or clear) a row's value for one schema morphism, replacing any prior value. */
    const setValue = (rowId: string, morphismId: string, value?: RowValue): void => {
        if (findRow(doc, rowId) === undefined) {
            throw new Error(`No instance row with id "${rowId}".`);
        }
        change((d) => {
            const found = findRow(d, rowId);
            if (!found) {
                return;
            }
            if (value === undefined) {
                // Clearing removes the key outright (rather than storing a
                // `null` cell value), matching an unset column.
                delete found.row.fields[morphismId];
            } else {
                found.row.fields[morphismId] = encodeRowValue(value);
            }
        });
    };

    /** Update a row's values by schema morphism name, leaving unspecified values unchanged. */
    const updateRow = (rowId: string, args: Record<string, RowValue>): void => {
        const objectId = objectIdOfRow(rowId);
        if (objectId === undefined) {
            throw new Error(`No instance row with id "${rowId}".`);
        }
        for (const [key, value] of Object.entries(args)) {
            const morphism = morphismByName(key, objectId);
            if (!morphism) {
                const name = schemaObjectJudgment(objectId)?.name ?? objectId;
                throw new Error(
                    `No mapping or attribute named "${key}" on schema object "${name}".`,
                );
            }
            setValue(rowId, morphism.id, value);
        }
    };

    /**
     * Delete a row: remove it (and the mapping/attribute values drawn out of it)
     * from its table. Values in *other* rows referencing it (foreign keys
     * pointing at it) are left in place and become invalid on the next {@link
     * Instance.validate}, mirroring a deleted mapping target. The table itself
     * is kept, even when emptied.
     */
    const deleteRow = (rowId: string): void => {
        change((d) => {
            const found = findRow(d, rowId);
            if (!found) {
                return;
            }
            // Delete the row entry and drop it from the order in place rather
            // than reassigning filtered copies: a filtered copy would re-insert
            // the surviving rows, which an Automerge store rejects ("cannot
            // create a reference to an existing document object").
            delete found.table.rows[rowId];
            const index = found.table.row_order.indexOf(rowId);
            if (index >= 0) {
                found.table.row_order.splice(index, 1);
            }
        });
    };

    /** Build a row handle over the row with the given id. */
    const rowHandle = (id: string): Row => ({
        id,
        update(args: Record<string, RowValue>) {
            updateRow(id, args);
        },
        set(morphism: { readonly id: string }, value?: RowValue) {
            if ("morType" in morphism) {
                morphismRefs.set(morphism.id, morphism as MorGenerator);
            }
            setValue(id, morphism.id, value);
        },
        delete() {
            deleteRow(id);
        },
        get entity() {
            const objectId = objectIdOfRow(id);
            if (objectId === undefined) {
                throw new Error(`Row "${id}" is not in the instance.`);
            }
            return schemaObjectCell(objectId);
        },
        get(morphism: { readonly id: string }): RowValue | undefined {
            if ("morType" in morphism) {
                morphismRefs.set(morphism.id, morphism as MorGenerator);
            }
            const found = findRow(doc, id);
            if (!found) {
                return undefined;
            }
            const value = found.row.fields[morphism.id];
            // Only surface the value if the morphism is still a live schema
            // morphism (a deleted column's data is retained but hidden).
            if (value === undefined || !morphismPresentation(morphism.id)) {
                return undefined;
            }
            return decodeCellValue(value);
        },
        get valuesById() {
            const out: Record<string, RowValue> = {};
            const found = findRow(doc, id);
            if (!found) {
                return out;
            }
            for (const [morphismId, value] of Object.entries(found.row.fields)) {
                // A value whose morphism is no longer a live schema morphism is
                // retained in the document but omitted from the view, so a
                // deleted column drops out without losing its data.
                if (!morphismPresentation(morphismId)) {
                    continue;
                }
                const decoded = decodeCellValue(value);
                if (decoded !== undefined) {
                    out[morphismId] = decoded;
                }
            }
            return out;
        },
        get values() {
            const out: Record<string, RowValue> = {};
            const found = findRow(doc, id);
            if (!found) {
                return out;
            }
            for (const [morphismId, value] of Object.entries(found.row.fields)) {
                // A value whose morphism is no longer a live schema morphism is
                // retained in the document but omitted from the view, so a
                // deleted column drops out without losing its data.
                const morphism = morphismPresentation(morphismId);
                if (!morphism) {
                    continue;
                }
                // NOTE: keyed by morphism *name*, so two morphisms sharing a name
                // collide here (last wins). For a UUID-keyed, collision-free read
                // use `get(morphism)` or `valuesById`; the stored content is
                // always UUID-keyed and unaffected by this convenience view.
                const decoded = decodeCellValue(value);
                if (decoded !== undefined) {
                    const name = morphism.label?.join(".");
                    if (name) {
                        out[name] = decoded;
                    }
                }
            }
            return out;
        },
    });

    /**
     * Elaborate the tables into the {@link DiagramJudgment}s a diagram-in-model
     * would carry, so the instance validates through exactly the same catlog path
     * a diagram does. Each row of a table becomes an object judgment over the
     * table's schema object; each of the row's content values becomes a morphism
     * judgment over its schema morphism, from the row to either the referenced
     * row (a mapping) or a freshly synthesized value object carrying the literal
     * (an attribute).
     *
     * Tables over a deleted schema object, and values over a deleted schema
     * morphism, are skipped: retained data, but not part of the current
     * instance's meaning.
     */
    const toDiagramJudgments = (schemaModel: DblModel): DiagramJudgment[] => {
        const judgments: DiagramJudgment[] = [];
        // Only tables over a live schema object contribute; note their rows so a
        // value whose row was skipped is skipped too.
        const liveRows: Array<{ row: TableRow; objectId: string }> = [];
        for (const table of Object.values(doc.tables)) {
            const objectId = table.id;
            if (!modelHasObject(schemaModel, objectId)) {
                // The schema object is gone: keep the data, but it has no meaning
                // in the current schema, so it contributes nothing to validate.
                continue;
            }
            const objectJudgment = schemaModel.obPresentation(objectId);
            for (const row of Object.values(table.rows)) {
                liveRows.push({ row, objectId });
                judgments.push({
                    tag: "object",
                    id: row.id,
                    name: "",
                    obType: objectJudgment.obType,
                    over: { tag: "Basic", content: objectId },
                });
            }
        }
        for (const { row } of liveRows) {
            for (const [morphismId, value] of Object.entries(row.fields)) {
                if (!modelHasMorphism(schemaModel, morphismId)) {
                    continue;
                }
                const morphism = schemaModel.morPresentation(morphismId);
                if (!morphism) {
                    continue;
                }
                if (value === "Null") {
                    // An explicit null is an unset column: nothing to validate.
                    continue;
                }
                let cod: Ob | null;
                if ("RowRef" in value) {
                    cod = { tag: "Basic", content: value.RowRef };
                } else {
                    // Materialize a value object for the literal so the attribute
                    // has a codomain object to point at, exactly as the schema
                    // morphism's codomain expects.
                    const literal =
                        "Bool" in value
                            ? value.Bool
                            : "Int" in value
                              ? value.Int
                              : "Float" in value
                                ? value.Float
                                : value.String;
                    const valueId = v7();
                    const codObjectId = obRefId(morphism.cod);
                    const codObject =
                        codObjectId !== undefined && modelHasObject(schemaModel, codObjectId)
                            ? schemaModel.obPresentation(codObjectId)
                            : undefined;
                    judgments.push({
                        tag: "object",
                        id: valueId,
                        name: String(literal),
                        obType: codObject?.obType ?? { tag: "Basic", content: "" },
                        over: codObjectId ? { tag: "Basic", content: codObjectId } : null,
                    });
                    cod = { tag: "Basic", content: valueId };
                }
                judgments.push({
                    tag: "morphism",
                    id: v7(),
                    name: "",
                    morType: morphism.morType,
                    over: { tag: "Basic", content: morphism.id },
                    dom: { tag: "Basic", content: row.id },
                    cod,
                });
            }
        }
        return judgments;
    };

    const onChangeFormalContent = (callback: () => void): (() => void) => {
        const signature = () => JSON.stringify(doc.tables);
        let previous = signature();
        return store.subscribe(handle, () => {
            const next = signature();
            if (next !== previous) {
                previous = next;
                callback();
            }
        });
    };

    const instance = {
        // A transaction re-attaches this same instance flavor over a store
        // draft; the *model* notebook is shared, not cloned. Stamped with the
        // shape like `Binder.createInstance` stamps the original.
        ...transactionMethods(store, handle, (draft) =>
            withShape(attachInstanceNotebook(store, draft, shape, model, elaboratedModel), shape),
        ),
        get title() {
            return doc.name;
        },
        get theory() {
            return modelDocument().theory;
        },
        handle,
        modelNotebook: model,
        get document() {
            return doc;
        },
        dump() {
            return copy(doc);
        },
        update(u: { title?: string }) {
            change((d) => {
                if (u.title !== undefined) {
                    d.name = u.title;
                }
            });
        },
        onChange(callback: () => void): () => void {
            return store.subscribe(handle, callback);
        },
        onChangeFormalContent,
        add(object: ModelObjectRef, args?: Record<string, RowValue>): Row {
            return insertRow(object, args);
        },
        rows(): Row[] {
            return Object.values(doc.tables).flatMap((table) =>
                table.row_order.map((rowId) => rowHandle(rowId)),
            );
        },
        rowsOf(object: ModelObjectRef): Row[] {
            return tableFor(doc, object.id)?.row_order.map((rowId) => rowHandle(rowId)) ?? [];
        },
        async validate(): Promise<DiagramValidationResult> {
            return (await runValidation()).result;
        },
        onValidate(callback: (result: DiagramValidationResult) => void): () => void {
            return createValidationObserver<DiagramValidationSnapshot>({
                validate: async () => ({
                    ...(await runValidation()),
                    // The instance's own formal content is its tables, the same
                    // signature `onChangeFormalContent` dedupes on.
                    ownSignature: JSON.stringify(doc.tables),
                }),
                cache: modelCacheFor(store),
                depRootId: doc.instanceOf._id,
                subscribeOwn: onChangeFormalContent,
                equivalent: sameDiagramValidation,
                deliver: (snapshot) => callback(snapshot.result),
            });
        },
    };

    /**
     * One validation run, also reporting the schema model it validated in (when
     * resolution succeeded): {@link Instance.onValidate} compares that model's
     * identity across runs, which the {@link DiagramValidationResult} alone
     * cannot provide.
     */
    const runValidation = async (): Promise<{
        result: DiagramValidationResult;
        model: DblModel | undefined;
    }> => {
        const coreTheory = await resolveCoreTheory({
            getCoreTheory: shape.getCoreTheory,
        });
        if (!coreTheory) {
            throw new Error(
                "validate() needs the schema's core theory: this instance shape has " +
                    "no `getCoreTheory`.",
            );
        }
        let model: DblModel;
        try {
            model = await resolveModelInStore(store, refFromLink(doc.instanceOf), coreTheory);
            elaboratedModel = model;
        } catch (e) {
            return {
                result: { tag: "Illformed", diagram: null, error: String(e) },
                model: undefined,
            };
        }
        let diagram: DblModelDiagram;
        try {
            diagram = elaborateDiagram(toDiagramJudgments(model), coreTheory);
        } catch (e) {
            return { result: { tag: "Illformed", diagram: null, error: String(e) }, model };
        }
        // NB: unlike the diagram notebook's `validate`, we deliberately do NOT
        // call `diagram.inferMissingFrom(model)` here. For an instance, every
        // mapping's codomain object should already exist — it is another row,
        // which gets its own object judgment from its table membership. The
        // only time an endpoint object is missing is when a mapping's target
        // row was deleted (a dangling foreign key): inference would silently
        // fabricate the missing object and heal the dangling ref, so the
        // instance would validate as `Valid` despite the invalid reference the
        // UI flags. Skipping inference lets `validateIn` surface it instead.
        const result = diagram.validateIn(model);
        if (result.tag === "Ok") {
            return { result: { tag: "Valid", diagram }, model };
        }
        return { result: { tag: "Invalid", diagram, errors: result.content }, model };
    };

    if (isPlainStore) {
        plainDocumentId(handle as Document);
    }

    return instance as unknown as Instance<TShape, Handle, TModelShape>;
}

function attachNotebook<TShape extends AnyShape, Handle>(
    store: DocumentStore<Handle>,
    handle: Handle,
    shape: TShape,
    // The model handle a diagram is drawn in. Required for diagram shapes (whose
    // sole construction path, `createNotebook` with `in`, always has it), unused
    // for model and analysis shapes.
    modelHandle?: Handle,
): Notebook<TShape, Handle> {
    if (isAnalysisShape(shape)) {
        return withShape(attachAnalysisNotebook(store, handle, shape), shape) as Notebook<
            TShape,
            Handle
        >;
    }
    if (isDiagramShape(shape)) {
        if (modelHandle === undefined) {
            throw new Error("Diagram notebook requires the model handle it is drawn in.");
        }
        return withShape(
            attachDiagramNotebook(store, handle, shape, modelHandle),
            shape,
        ) as Notebook<TShape, Handle>;
    }
    const doc = store.getDocumentView(handle) as ModelDocument;
    const change = (fn: (doc: ModelDocument) => void) =>
        store.changeDocument(handle, fn as (doc: Document) => void);
    const copy = <T>(value: T): T => store.copyValue(handle, value);
    const isPlainStore = (store as DocumentStore<unknown>) === plainStore;

    const changeRichText = makeRichTextUpdater(change);

    /**
     * Elaborate this notebook's own model by minting a link to its own handle
     * and resolving it through the shared resolver against the store. Resolution
     * is the recursive workhorse — it walks this notebook's instantiations
     * (resolving each via {@link DocumentStore.getHandle}) and elaborates each,
     * along with this notebook itself, against the given `coreTheory` — so
     * `validate` and `migrateTo` delegate here rather than building the
     * instantiated map and elaborating themselves. Every instantiation is
     * validatable against the host's core theory, so that single theory is
     * threaded through the whole resolution tree. Returns the elaborated
     * {@link DblModel}, or an error string when resolution rejects.
     */
    const resolveSelf = async (coreTheory: DblTheory): Promise<DblModel | { error: string }> => {
        const ref = store.getDocumentRef(handle);
        try {
            return await resolveModelInStore(store, ref, coreTheory);
        } catch (e) {
            // Surface the error's own message (e.g. a CyclicInstantiationError's
            // named cycle) rather than `String(e)`, which prepends a noisy
            // `Error:` and buries the actionable text.
            return { error: e instanceof Error ? e.message : String(e) };
        }
    };

    /** Read a cell's content, or `undefined` if the cell is no longer in the
    notebook (e.g. it was deleted after the handle was obtained). Reads off a
    stale handle thus yield `undefined` rather than throwing. */
    const readCellContent = <T>(cellId: string): T | undefined => {
        const cell = doc.notebook.cellContents[cellId];
        if (!cell) {
            return undefined;
        }
        return (cell as unknown as { content: T }).content;
    };

    const cloneJudgment = (judgment: ModelJudgment): ModelJudgment =>
        duplicateModelJudgment(copy(judgment));

    const linkForModel = (model: ValidatableNotebook<Handle> | null): Link | null => {
        if (model === null) {
            return null;
        }
        return linkFromRef(store.getDocumentRef(model.handle), "instantiation");
    };

    const encodeSpecializations = (
        specializations: readonly InstantiationSpecialization[] | undefined,
    ): SpecializeModel[] =>
        (specializations ?? []).map((specialization) => ({
            id: specialization.object.id,
            ob: encodeObjectRef(specialization.as),
        }));

    const duplicateFormalCell = (cellId: string): Cell<ModelJudgment> => {
        const cell = doc.notebook.cellContents[cellId];
        if (!cell) {
            throw new Error(`Failed to find notebook cell contents for cell '${cellId}'`);
        }
        return duplicateCell(cell, cloneJudgment);
    };

    const appendDuplicate = (cellId: string): string => {
        const duplicatedCell = duplicateFormalCell(cellId);
        change((d) => {
            d.notebook.cellContents[duplicatedCell.id] = duplicatedCell;
            d.notebook.cellOrder.push(duplicatedCell.id);
        });
        return duplicatedCell.id;
    };

    /** Move a cell, locating it by id inside the change so stale indices
    cannot misplace it. The target index is interpreted after removal and
    clamped to the valid range; impossible moves are silent no-ops. */
    const moveCell = (cellId: string, target: (from: number) => number) =>
        change((d) => {
            const order = d.notebook.cellOrder;
            const from = order.indexOf(cellId);
            if (from < 0) {
                return;
            }
            const to = Math.max(0, Math.min(target(from), order.length - 1));
            if (to === from) {
                return;
            }
            order.splice(from, 1);
            order.splice(to, 0, cellId);
        });

    const deleteCell = (cellId: string) =>
        change((d) => {
            const order = d.notebook.cellOrder;
            const from = order.indexOf(cellId);
            if (from < 0) {
                return;
            }
            order.splice(from, 1);
            delete d.notebook.cellContents[cellId];
        });

    const reorderMethods = (cellId: string): Reorder => ({
        moveUp: () => moveCell(cellId, (from) => from - 1),
        moveDown: () => moveCell(cellId, (from) => from + 1),
        moveTo: (index: number) => moveCell(cellId, () => index),
        delete: () => deleteCell(cellId),
    });

    const objectHandle = <Def extends ObjectDef>(cellId: string, type: Def): ObjectCell<Def> =>
        ({
            kind: CellKind.Object,
            get id() {
                return readCellContent<{ id: string }>(cellId)?.id;
            },
            type,
            get label() {
                return readCellContent<{ name: string }>(cellId)?.name;
            },
            update(u: { label?: string }) {
                // Re-check the partial update at runtime: the typed `update`
                // rejects field mistakes at compile time, but an untyped
                // (plain-JS) caller bypasses that, so validate here and throw a
                // `ValidationError` rather than silently writing a corrupt cell.
                validateUpdateArgs(type, u);
                change((d) => {
                    const content = (
                        d.notebook.cellContents[cellId] as { content: { name: string } }
                    ).content;
                    // Map the public `label` field to the stored `name` key.
                    if (u.label !== undefined) {
                        content.name = u.label;
                    }
                });
            },
            duplicate() {
                return objectHandle(appendDuplicate(cellId), type);
            },
            ...reorderMethods(cellId),
        }) as unknown as ObjectCell<Def>;

    /**
     * The object cell for a generator id, or `undefined` if no live object cell
     * has that id. An endpoint can dangle: a morphism keeps referencing an object
     * that has since been deleted (e.g. a mapping whose codomain entity was
     * removed). That is a valid transient schema state — reading the endpoint
     * must degrade gracefully (the dangling reference is simply omitted) rather
     * than throw and crash every consumer that reads `.from` / `.to`.
     */
    const objectHandleForId = (objectId: string): ObjectCell | undefined => {
        for (const candidateCellId of doc.notebook.cellOrder) {
            const cell = doc.notebook.cellContents[candidateCellId];
            if (cell?.tag !== "formal" || cell.content.tag !== "object") {
                continue;
            }
            if (cell.content.id === objectId) {
                return objectHandle(candidateCellId, defineObject(cell.content.obType));
            }
        }
        return undefined;
    };

    /** Flatten any stored endpoint object into the object-cell handles it
    references, regardless of tensor/list wrapping. A dangling reference (an id
    with no live object cell) is skipped. */
    const decodeEndpointObjects = (value: Ob | null): ObjectCell[] => {
        if (!value) {
            return [];
        }
        switch (value.tag) {
            case "Basic": {
                const cell = objectHandleForId(value.content);
                return cell ? [cell] : [];
            }
            case "App":
                return decodeEndpointObjects(value.content.ob);
            case "List":
                return value.content.objects.flatMap((item) => decodeEndpointObjects(item));
            case "Tabulated":
                return [];
        }
    };

    /** Decode a stored endpoint, choosing array vs single shape from the
    morphism's declared modality rather than from the stored value's shape. */
    const decodeEndpoint = (
        modality: Modality | null,
        value: Ob | null,
    ): ObjectCell | ObjectCell[] => {
        const objects = decodeEndpointObjects(value);
        if (modality !== null) {
            return objects;
        }
        return objects[0] as ObjectCell;
    };

    const morphismHandle = <Def extends MorphismDef>(
        cellId: string,
        type: Def,
    ): MorphismCell<Def> =>
        ({
            kind: CellKind.Morphism,
            get id() {
                return readCellContent<{ id: string }>(cellId)?.id;
            },
            type,
            get label() {
                return readCellContent<{ name: string }>(cellId)?.name;
            },
            get from() {
                const content = readCellContent<{ dom: Ob | null }>(cellId);
                return content && decodeEndpoint(type.domain?.modality ?? null, content.dom);
            },
            get to() {
                const content = readCellContent<{ cod: Ob | null }>(cellId);
                return content && decodeEndpoint(type.codomain?.modality ?? null, content.cod);
            },
            update(u: { label?: string; from?: unknown; to?: unknown }) {
                // Re-check the partial update at runtime: the typed `update`
                // rejects endpoint mistakes at compile time, but an untyped
                // (plain-JS) caller bypasses that, so validate here and throw a
                // `ValidationError` rather than silently writing a corrupt cell.
                validateUpdateArgs(type, u);
                change((d) => {
                    const content = (
                        d.notebook.cellContents[cellId] as {
                            content: { name: string; dom: Ob | null; cod: Ob | null };
                        }
                    ).content;
                    if (u.label !== undefined) {
                        content.name = u.label;
                    }
                    if ("from" in u) {
                        content.dom = encodeEndpoint(
                            type.domain?.apply ?? null,
                            type.domain?.modality ?? null,
                            u.from,
                        );
                    }
                    if ("to" in u) {
                        content.cod = encodeEndpoint(
                            type.codomain?.apply ?? null,
                            type.codomain?.modality ?? null,
                            u.to,
                        );
                    }
                });
            },
            duplicate() {
                return morphismHandle(appendDuplicate(cellId), type);
            },
            ...reorderMethods(cellId),
        }) as unknown as MorphismCell<Def>;

    /**
     * Reconstruct a stored morphism judgment's {@link MorphismDef}, recovering
     * each list endpoint's `apply` op and modality from the stored
     * `App(apply, List(modality, …))` — inverting the encoding in
     * `encodeEndpoint` — so the reconstructed def matches the one its
     * {@link MorphismDef} declares (see `cellsOf`).
     */
    const morphismDefForJudgment = (judgment: {
        morType: MorType;
        dom: Ob | null;
        cod: Ob | null;
    }): MorphismDef => {
        const endpointMeta = (ob: Ob | null): MorEndpointMeta | undefined => {
            const apply = endpointApplyOp(ob);
            return apply ? { apply, modality: endpointListModality(ob) ?? undefined } : undefined;
        };
        return {
            tag: "morphism",
            morType: judgment.morType,
            domain: endpointMeta(judgment.dom),
            codomain: endpointMeta(judgment.cod),
        };
    };

    /**
     * The morphism cell for a generator id, or `undefined` if no live morphism
     * cell has that id — the morphism-side counterpart of
     * {@link objectHandleForId}. An equation's path can dangle: it keeps
     * referencing a morphism that has since been deleted. That is a valid
     * transient state — reading the path must degrade gracefully (the dangling
     * reference is simply omitted) rather than throw.
     */
    const morphismHandleForId = (morphismId: string): MorphismCell | undefined => {
        for (const candidateCellId of doc.notebook.cellOrder) {
            const cell = doc.notebook.cellContents[candidateCellId];
            if (cell?.tag !== "formal" || cell.content.tag !== "morphism") {
                continue;
            }
            if (cell.content.id === morphismId) {
                return morphismHandle(candidateCellId, morphismDefForJudgment(cell.content));
            }
        }
        return undefined;
    };

    /**
     * Decode a stored equation side into the morphism cells its path
     * references, in composition order: a bare morphism is a one-step path and
     * a `Composite` sequence contributes its steps. A dangling reference (an id
     * with no live morphism cell) is skipped; an identity path (`Id`) or any
     * other morphism expression contributes no steps.
     */
    const decodePath = (mor: Mor | null | undefined): MorphismCell[] => {
        if (!mor) {
            return [];
        }
        switch (mor.tag) {
            case "Basic": {
                const cell = morphismHandleForId(mor.content);
                return cell ? [cell] : [];
            }
            case "Composite":
                return mor.content.tag === "Seq"
                    ? mor.content.content.flatMap((step) => decodePath(step))
                    : [];
            default:
                return [];
        }
    };

    /**
     * Encode a path of morphism cells as a stored equation side: an empty (or
     * `null`) path is `null` (an unset side), a single step is stored as the
     * bare morphism, and a longer path as a `Composite` sequence — the same
     * convention the frontend equation editor persists.
     */
    const encodePath = (
        cells: readonly { readonly id: string }[] | null | undefined,
    ): Mor | null => {
        const steps = (cells ?? []).map((cell): Mor => ({ tag: "Basic", content: cell.id }));
        if (steps.length === 0) {
            return null;
        }
        const first = steps[0];
        if (steps.length === 1 && first) {
            return first;
        }
        return { tag: "Composite", content: { tag: "Seq", content: steps } };
    };

    const pathEquationHandle = (cellId: string): PathEquationCell =>
        ({
            kind: CellKind.PathEquation,
            get id() {
                return readCellContent<{ id: string }>(cellId)?.id;
            },
            get label() {
                return readCellContent<{ name: string }>(cellId)?.name;
            },
            get lhs() {
                return decodePath(readCellContent<{ lhs: Mor | null }>(cellId)?.lhs);
            },
            get rhs() {
                return decodePath(readCellContent<{ rhs: Mor | null }>(cellId)?.rhs);
            },
            update(u: Partial<PathEquationArgs>) {
                // Re-check the partial update at runtime: the typed `update`
                // rejects path mistakes at compile time, but an untyped
                // (plain-JS) caller bypasses that, so validate here and throw a
                // `ValidationError` rather than silently writing a corrupt cell.
                validatePathEquationUpdateArgs(u);
                change((d) => {
                    const content = (
                        d.notebook.cellContents[cellId] as {
                            content: { name: string; lhs: Mor | null; rhs: Mor | null };
                        }
                    ).content;
                    if (u.label !== undefined) {
                        content.name = u.label ?? "";
                    }
                    if ("lhs" in u) {
                        content.lhs = encodePath(u.lhs);
                    }
                    if ("rhs" in u) {
                        content.rhs = encodePath(u.rhs);
                    }
                });
            },
            duplicate() {
                return pathEquationHandle(appendDuplicate(cellId));
            },
            ...reorderMethods(cellId),
        }) as unknown as PathEquationCell;

    const richTextHandle = (cellId: string): RichTextCell =>
        ({
            kind: CellKind.RichText,
            id: cellId,
            get content() {
                return readCellContent<RichTextContent>(cellId);
            },
            get editorRef() {
                return store.getRichTextRef?.(handle, cellId);
            },
            update(u: { content?: RichTextContent }) {
                changeRichText(cellId, u);
            },
            ...reorderMethods(cellId),
        }) as unknown as RichTextCell;

    const instantiationHandle = (cellId: string): InstantiationCell<Handle> =>
        ({
            kind: CellKind.Instantiation,
            get id() {
                return readCellContent<{ id: string }>(cellId)?.id;
            },
            get label() {
                return readCellContent<{ name: string }>(cellId)?.name;
            },
            get model() {
                return readCellContent<{ model: Link | null }>(cellId)?.model;
            },
            get specializations() {
                return readCellContent<{ specializations: SpecializeModel[] }>(cellId)
                    ?.specializations;
            },
            update(u: Partial<InstantiationArgs<Handle>>) {
                change((d) => {
                    const content = (
                        d.notebook.cellContents[cellId] as {
                            content: {
                                name: string;
                                model: Link | null;
                                specializations: SpecializeModel[];
                            };
                        }
                    ).content;
                    if (u.label !== undefined) {
                        content.name = u.label;
                    }
                    if ("model" in u) {
                        content.model = linkForModel(u.model ?? null);
                    }
                    if ("specializations" in u) {
                        content.specializations = encodeSpecializations(u.specializations);
                    }
                });
            },
            duplicate() {
                return instantiationHandle(appendDuplicate(cellId));
            },
            ...reorderMethods(cellId),
        }) as unknown as InstantiationCell<Handle>;

    const isShapeMorphism = (def: MorphismDef): boolean =>
        (shape.morphisms ?? []).some((t) => sameMorphismType(t, def));

    const isShapeObject = (def: ObjectDef): boolean =>
        (shape.objects ?? []).some((t) => sameTypeValue(t, def));

    const addObjectCell = (def: ObjectDef, label: string): ObjectCell => {
        const judgment = newObjectDecl(def.obType);
        judgment.name = label;
        const formalCell = newFormalCell(judgment);
        change((d) => {
            d.notebook.cellContents[formalCell.id] = formalCell;
            d.notebook.cellOrder.push(formalCell.id);
        });
        return objectHandle(formalCell.id, def);
    };

    const addMorphismCell = (
        def: MorphismDef,
        args: { label: string | null; from?: unknown; to?: unknown },
    ): MorphismCell => {
        const judgment = newMorphismDecl(def.morType);
        judgment.name = args.label ?? "";
        judgment.dom = encodeEndpoint(
            def.domain?.apply ?? null,
            def.domain?.modality ?? null,
            args.from,
        );
        judgment.cod = encodeEndpoint(
            def.codomain?.apply ?? null,
            def.codomain?.modality ?? null,
            args.to,
        );
        const formalCell = newFormalCell(judgment);
        change((d) => {
            d.notebook.cellContents[formalCell.id] = formalCell;
            d.notebook.cellOrder.push(formalCell.id);
        });
        return morphismHandle(formalCell.id, def);
    };

    const addInstantiationCell = (args: InstantiationArgs<Handle>): InstantiationCell<Handle> => {
        const judgment = newInstantiatedModel(linkForModel(args.model));
        judgment.name = args.label;
        judgment.specializations = encodeSpecializations(args.specializations);
        const formalCell = newFormalCell(judgment);
        change((d) => {
            d.notebook.cellContents[formalCell.id] = formalCell;
            d.notebook.cellOrder.push(formalCell.id);
        });
        return instantiationHandle(formalCell.id);
    };

    const addPathEquationCell = (args: PathEquationArgs): PathEquationCell => {
        const judgment = newEquationDecl();
        judgment.name = args.label ?? "";
        judgment.lhs = encodePath(args.lhs);
        judgment.rhs = encodePath(args.rhs);
        const formalCell = newFormalCell(judgment);
        change((d) => {
            d.notebook.cellContents[formalCell.id] = formalCell;
            d.notebook.cellOrder.push(formalCell.id);
        });
        return pathEquationHandle(formalCell.id);
    };

    const impl = {
        // A transaction re-attaches this same model flavor over a store draft
        // (via the `attachNotebook` dispatcher, which lands back in this model
        // branch and shape-stamps the draft notebook like the original).
        ...transactionMethods(store, handle, (draft) => attachNotebook(store, draft, shape)),
        get title() {
            return doc.name;
        },
        handle,
        get document() {
            return doc;
        },
        dump() {
            return copy(doc);
        },
        onChange(callback: () => void): () => void {
            return store.subscribe(handle, callback);
        },
        onChangeFormalContent(callback: () => void): () => void {
            const signature = () => formalCellsSignature(doc);
            let previous = signature();
            return impl.onChange(() => {
                const next = signature();
                if (next !== previous) {
                    previous = next;
                    callback();
                }
            });
        },
        async validate(): Promise<ModelValidationResult<TShape>> {
            const theory = await resolveCoreTheory(shape);
            if (!theory) {
                throw new Error(
                    "validate() needs a core theory: this shape has no `getCoreTheory`.",
                );
            }
            // Delegate elaboration to the store: mint a link to this notebook's
            // own handle and resolve it. The store walks this notebook's
            // instantiations (resolving each recursively) and elaborates against
            // the registered core theory. A successfully elaborated and
            // validated model is an `Ok`; a model that fails validation, or
            // one that fails to even elaborate, is an `Err` carrying issues.
            const resolved = await resolveSelf(theory);
            if ("error" in resolved) {
                return { tag: "Err", content: [{ message: resolved.error }] };
            }
            const model = resolved;
            // Memoized per model object: a cached model keeps its outcome until
            // an edit re-elaborates it into a new object.
            const result = validateModelCached(model);
            if (result.tag === "Ok") {
                return { tag: "Ok", content: asValidatedModel<TShape>(model) };
            }
            return { tag: "Err", content: result.content.map(modelErrorToIssue) };
        },
        onValidate(callback: (result: ModelValidationResult<TShape>) => void): () => void {
            return createValidationObserver<ModelValidationResult<TShape>>({
                validate: () => impl.validate(),
                cache: modelCacheFor(store),
                depRootId: store.getDocumentRef(handle).id,
                subscribeOwn: (cb) => impl.onChangeFormalContent(cb),
                equivalent: sameModelValidation,
                deliver: callback,
            });
        },
        async migrateTo<TTarget extends CreatableShape>(targetShape: TTarget) {
            // Trivial migration: an empty notebook or an inclusion target only
            // needs its theory rewritten; cell types are left untouched.
            const hasFormalCells = doc.notebook.cellOrder.some(
                (cellId) => doc.notebook.cellContents[cellId]?.tag === "formal",
            );
            const isInclusion = (shape.inclusions ?? []).includes(targetShape.theory);
            if (!hasFormalCells || isInclusion) {
                change((d) => {
                    d.theory = targetShape.theory;
                    delete d.editorVariant;
                });
                return { tag: "Ok", content: attachNotebook(store, handle, targetShape) };
            }

            // Pushforward migration: transport the elaborated model along the
            // theory morphism, then re-type each cell from the migrated model.
            const migration = (shape.migrations ?? []).find((m) => m.target === targetShape.theory);
            if (!migration) {
                return {
                    tag: "Err",
                    content: [
                        {
                            message: `No migration defined from "${shape.theory}" to "${targetShape.theory}".`,
                        },
                    ],
                };
            }
            const sourceCoreTheory = await resolveCoreTheory(shape);
            const targetCoreTheory = await resolveCoreTheory(targetShape);
            if (!sourceCoreTheory || !targetCoreTheory) {
                return {
                    tag: "Err",
                    content: [
                        {
                            message:
                                "Migration needs the source and target core theories; one shape has none.",
                        },
                    ],
                };
            }

            // Obtain the source model through the store (same recursive
            // resolution as `validate`), then transport it along the morphism.
            const resolved = await resolveSelf(sourceCoreTheory);
            if ("error" in resolved) {
                return {
                    tag: "Err",
                    content: [
                        {
                            message:
                                `Cannot migrate notebook from "${shape.theory}" to ` +
                                `"${targetShape.theory}": ${resolved.error}`,
                        },
                    ],
                };
            }
            const model = resolved;

            const migrated = await migration.migrate(model, targetCoreTheory);
            change((d) => {
                d.theory = targetShape.theory;
                delete d.editorVariant;
                for (const cellId of d.notebook.cellOrder) {
                    const cell = d.notebook.cellContents[cellId];
                    if (!cell || cell.tag !== "formal") {
                        continue;
                    }
                    const judgment = cell.content as ModelJudgment;
                    if (judgment.tag === "object") {
                        judgment.obType = migrated.obType({ tag: "Basic", content: judgment.id });
                    } else if (judgment.tag === "morphism") {
                        judgment.morType = migrated.morType({ tag: "Basic", content: judgment.id });
                    }
                }
            });
            return { tag: "Ok", content: attachNotebook(store, handle, targetShape) };
        },
        update(u: { title?: string }) {
            change((d) => {
                if (u.title !== undefined) {
                    d.name = u.title;
                }
            });
        },
        supports(arg: ObjectDef | MorphismDef | AnyShape): boolean {
            // A def carries an "object"/"morphism" `tag`; a shape does not.
            if ("tag" in arg) {
                return arg.tag === "object" ? isShapeObject(arg) : isShapeMorphism(arg);
            }
            return (
                (arg.objects ?? []).every((t) => isShapeObject(t)) &&
                (arg.morphisms ?? []).every((t) => isShapeMorphism(t))
            );
        },
        cells(): Array<NotebookCell> {
            return doc.notebook.cellOrder.map((cellId) => {
                const cell = doc.notebook.cellContents[cellId];
                if (!cell) {
                    throw new Error(`Failed to find notebook cell contents for cell '${cellId}'`);
                }
                if (cell.tag === "rich-text") {
                    return richTextHandle(cellId);
                }
                const judgment = cell.content as ModelJudgment;
                switch (judgment.tag) {
                    case "object":
                        return objectHandle(cellId, defineObject(judgment.obType));
                    case "morphism":
                        return morphismHandle(cellId, morphismDefForJudgment(judgment));
                    case "instantiation":
                        return instantiationHandle(cellId);
                    case "equation":
                        return pathEquationHandle(cellId);
                    default:
                        // Every judgment tag is handled above; guard against a
                        // document written by a newer version at runtime.
                        throw new Error(
                            `Unsupported judgment tag: ${(judgment as { tag: string }).tag}`,
                        );
                }
            });
        },
        formalCells(): Array<Exclude<NotebookCell, RichTextCell>> {
            return impl.cells().filter((cell) => cell.kind !== CellKind.RichText) as Array<
                Exclude<NotebookCell, RichTextCell>
            >;
        },
        cellsOf(
            arg:
                | RichTextType
                | InstantiationType
                | PathEquationType
                | ObjectDef
                | MorphismDef
                | AnyShape,
        ): Array<NotebookCell> {
            // `RichText` selects just the rich-text cells.
            if (isRichTextType(arg)) {
                return impl.cells().filter((cell) => cell.kind === CellKind.RichText);
            }
            if (isInstantiationType(arg)) {
                return impl.cells().filter((cell) => cell.kind === CellKind.Instantiation);
            }
            if (isPathEquationType(arg)) {
                return impl.cells().filter((cell) => cell.kind === CellKind.PathEquation);
            }
            // A def carries an "object"/"morphism" `tag`; a shape does not. A
            // single def selects only its own cells (rich-text excluded); a
            // shape includes rich-text cells only when it opts in with
            // `informal: [RichText]`, and path-equation cells only when it
            // opts in with `supportsEquations: true`.
            const isDef = "tag" in arg;
            const shape: AnyShape = isDef
                ? arg.tag === "object"
                    ? { objects: [arg] }
                    : { morphisms: [arg] }
                : arg;
            const objectDefs = shape.objects ?? [];
            const morphismDefs = shape.morphisms ?? [];
            const includeRichText = !isDef && shape.informal?.some(isRichTextType) === true;
            const includePathEquations = !isDef && shape.supportsEquations === true;
            return impl.cells().filter((cell) => {
                if (cell.kind === CellKind.RichText) {
                    return includeRichText;
                }
                if (cell.kind === CellKind.PathEquation) {
                    return includePathEquations;
                }
                if (cell.kind === CellKind.Object) {
                    const type = (cell as { type?: unknown }).type;
                    return objectDefs.some((def) => sameTypeValue(type, def));
                }
                if (cell.kind === CellKind.Morphism) {
                    const type = (cell as { type?: MorphismDef }).type;
                    return (
                        type !== undefined &&
                        morphismDefs.some((def) => sameMorphismType(type, def))
                    );
                }
                return false;
            });
        },
        get(
            arg: RichTextType | InstantiationType | PathEquationType | ObjectDef | MorphismDef,
            id: string,
        ): Result<NotebookCell> {
            const cell = impl.cellsOf(arg).find((cell) => cell.id === id);
            if (cell !== undefined) {
                return { tag: "Ok", content: cell };
            }
            const existsWithOtherType = impl
                .cells()
                .some((other) => (other as { id: string }).id === id);
            return {
                tag: "Err",
                content: [
                    existsWithOtherType
                        ? {
                              message: `Cell "${id}" is not of the expected type.`,
                              path: ["id"],
                          }
                        : { message: `No cell with id "${id}".`, path: ["id"] },
                ],
            };
        },
        add(
            type: unknown,
            args: {
                content?: RichTextContent;
                label?: string;
                from?: unknown;
                to?: unknown;
                lhs?: unknown;
                rhs?: unknown;
                model?: ValidatableNotebook<Handle> | null;
                specializations?: readonly InstantiationSpecialization[];
            },
        ) {
            if (isRichTextType(type)) {
                const cell = newRichTextCell((args as { content?: RichTextContent })?.content);
                change((d) => {
                    d.notebook.cellContents[cell.id] = cell;
                    d.notebook.cellOrder.push(cell.id);
                });
                return richTextHandle(cell.id);
            }
            if (isInstantiationType(type)) {
                return addInstantiationCell(args as InstantiationArgs<Handle>);
            }
            if (isPathEquationType(type)) {
                // The typed `add` already rejects this at compile time (see
                // `HasPathEquations`); re-check at runtime for plain-JS callers.
                if (shape.supportsEquations !== true) {
                    throw new ValidationError([
                        {
                            message:
                                "This notebook's shape does not declare path equations; " +
                                "declare `supportsEquations: true` on the shape to add them.",
                        },
                    ]);
                }
                validatePathEquationAddArgs(args);
                return addPathEquationCell(args as PathEquationArgs);
            }
            const def = type as ObjectDef | MorphismDef;
            // Re-check the arguments at runtime: the typed `add` rejects endpoint
            // mistakes at compile time, but an untyped (plain-JS) caller bypasses
            // that, so validate here and throw a `ValidationError` rather than
            // silently writing a corrupt cell.
            validateAddArgs(def, args);
            if (def.tag === "morphism") {
                return addMorphismCell(def, args as { label: string | null });
            }
            return addObjectCell(def, (args as { label: string }).label);
        },
    };

    const notebook = withShape(impl, shape) as unknown as Notebook<TShape, Handle>;

    if (isPlainStore) {
        // Ensure the document is reachable by id for the plain store's resolver.
        plainDocumentId(handle as Document);
    }

    return notebook;
}

/**
 * A notebook built over a {@link Shape}. The shape constrains the typed {@link
 * Notebook.add} constructor to the shape's cell types; reading via {@link
 * Notebook.cells} yields the shape-parametrized {@link NotebookCell} union,
 * with each declared object/morphism type contributing its own precise handle.
 *
 * A notebook over a richer shape is assignable to a notebook over a sub-shape,
 * so a fully-interactive component can be written against a sub-shape (e.g.
 * `Notebook<typeof PlacesShape>`) and handed a notebook of the full theory.
 */
// oxlint-disable-next-line typescript/no-explicit-any
export type Notebook<TShape extends AnyShape = AnyShape, Handle = any> = Update<{
    title: string;
}> &
    NotebookMethods<TShape, Handle> &
    CoreTheoryMethods<TShape, Handle> &
    AnalysisMethods<TShape> &
    DiagramMethods<TShape>;

/**
 * The object-literal surface of a {@link Notebook}, extracted into an interface
 * so its type-guard methods (`supports`) can narrow via `this` rather than
 * re-expanding `Notebook<TShape, Handle>`. Re-expanding the full notebook
 * reintroduces the core-theory-gated `validate`/`migrateTo` (see {@link
 * CoreTheoryMethods}) into the guard's narrowed type, which makes a
 * getCoreTheory-less picker notebook's `supports` incompatible with a
 * core-theory notebook's — breaking the "richer notebook into a sub-shape"
 * assignability the phantom shape bounds otherwise grant. Narrowing to `this`
 * instead keeps the guard tied to whatever the notebook actually is (including
 * any `& ValidatableNotebook` intersection at the use site), so assignability is
 * decided by the phantom bounds alone.
 */
// oxlint-disable-next-line typescript/no-explicit-any
interface NotebookMethods<TShape extends AnyShape = AnyShape, Handle = any> {
    /** The runtime shape this notebook was created or loaded with. */
    readonly shape: AnyShape;
    /**
     * Phantom carrier of the shape's declared *object* types, present only in
     * the type: the runtime object never provides it. It exists so shape
     * assignability is decided by the declared cell types rather than collapsing
     * under the method-bivariance of the rest of the surface. Its type is a
     * *bivariant* function over the declared object defs (see {@link
     * ObjectShapeBound}): a notebook is assignable to another when its declared
     * object types are a subset of, or a superset of, the target's. Over a
     * union of shapes the bound distributes into one bound per member, so a
     * notebook is accepted when it matches *some* member of the union — e.g. a
     * schema notebook declaring `{Entity, AttrType}` matches a union member
     * declaring just `{Entity}`. Objects and morphisms are carried on
     * *separate* members (see {@link __morphismShapeBound}) so the two axes are
     * related independently — a notebook that declares a superset of the
     * target's objects (extra object types alongside the shared ones) and a
     * subset of its morphisms is still accepted, rather than being rejected
     * because the combined type set is neither subset nor superset.
     */
    readonly __objectShapeBound?: ObjectShapeBound<TShape>;
    /**
     * Phantom carrier of the shape's declared *morphism* types; the morphism-side
     * counterpart of {@link __objectShapeBound}, compared bivariantly the same
     * way. Relating morphisms independently of objects is what rejects a notebook
     * whose morphisms are foreign to the target (e.g. `SimpleOlog`, whose
     * `Hom`-over-`Basic` aspect is neither a subset nor a superset of a list
     * shape's morphisms) while accepting one that merely adds extra object types.
     */
    readonly __morphismShapeBound?: MorphismShapeBound<TShape>;
    /**
     * Phantom carrier of whether the shape declares any morphism type, present
     * only in the type. It complements {@link __morphismShapeBound}: bivariance
     * relates declared morphisms by subset/superset, and the empty set is a
     * subset of everything, so a notebook declaring *no* morphisms would slip
     * through (its empty morphism set never produces the foreign type the
     * bivariance check rejects). This member closes that gap: a target whose
     * shape declares morphisms types it as the literal `true`, which a
     * morphism-free shape (typed `boolean`) cannot satisfy, so handing an
     * objects-only notebook to code that must add a morphism is rejected. A
     * target with no morphisms types it as `boolean` and still accepts any
     * notebook, preserving the "richer notebook into a sub-shape" assignability.
     */
    readonly __morphismBound?: DeclaresMorphism<TShape> extends true ? true : boolean;
    /**
     * Object-side dual of {@link __morphismBound}: requires that a notebook
     * handed to code expecting objects actually declares some. A target whose
     * shape declares object types types this as the literal `true`, which an
     * object-free shape (typed `boolean`) cannot satisfy, so handing a
     * morphisms-only notebook to code that must add an object is rejected. A
     * target with no objects types it as `boolean` and accepts any notebook.
     */
    readonly __objectBound?: DeclaresObject<TShape> extends true ? true : boolean;
    /** Reactive read of the notebook's title. */
    readonly title: string;
    /**
     * The store handle this notebook is bound to, e.g. an Automerge
     * `DocHandle`. With the plain in-memory store it is the document itself.
     */
    readonly handle: Handle;
    /**
     * The underlying document. With a reactive store (Solid, Automerge), this
     * is the reactive proxy; with the plain in-memory store it is the raw
     * object. Its type follows the shape: an analysis shape yields an {@link
     * AnalysisDocument}, any other shape a {@link ModelDocument}.
     */
    readonly document: DocumentOf<TShape>;
    /** Make a detached plain-JS snapshot of the underlying document. */
    dump(): DocumentOf<TShape>;
    /**
     * Open a *transaction*: a full notebook of the same shape attached over a
     * private store draft of this document. Mutations made through it (adds,
     * cell updates, deletes) are invisible on this notebook until
     * {@link Transaction.commit} merges them back in one step,
     * returning the {@link Commit} that {@link NotebookMethods.revertCommit}
     * undoes.
     *
     * Requires a store implementing the optional
     * {@link DocumentStore.createDraft}/{@link DocumentStore.commitDraft}
     * (e.g. the plain store, or an Automerge-backed store cloning into a draft
     * repo); throws otherwise.
     */
    beginTransaction(): Transaction<Notebook<TShape, Handle>>;
    /**
     * Undo a committed transaction's effects, as a new change to the document
     * (see {@link DocumentStore.revertCommit}): with a CRDT store, edits made
     * after the commit survive; with the plain store this is a rollback to the
     * commit's `before` snapshot. Throws when the store does not implement
     * `revertCommit`.
     */
    revertCommit(commit: Commit<unknown>): void;
    /**
     * Subscribe to changes to this notebook's document. The callback fires after
     * each change — including remote changes from other collaborators where the
     * store supports it (e.g. an Automerge `DocHandle`'s `change` event) — and
     * takes no arguments, so re-read whatever notebook state you need inside it.
     * Returns an unsubscribe function that removes the listener.
     *
     * This is the change source to drive a validation `createResource` off:
     * reading `formalCells()` directly as a resource source re-validates on every
     * tracked change because it rebuilds a fresh array each call (so it never
     * compares equal). Instead, bump a signal from `onChange` and key the
     * fetcher on a stable signature (e.g. the formal-cell ids), so unrelated
     * edits — such as adding a rich-text comment — do not re-validate.
     *
     * Every store implements {@link DocumentStore.subscribe}, so this always
     * fires for local mutations, and for remote changes where the store has a
     * remote source.
     */
    onChange(callback: () => void): () => void;
    /**
     * Subscribe to changes to the notebook's *formal* content. The callback
     * fires only when a formal cell is added, removed, reordered, or edited in
     * place, and is skipped for changes that leave the formal cells intact, such
     * as adding or editing a {@link RichText} comment.
     *
     * It is the ready-made source for a validation `createResource`: unlike
     * {@link Notebook.onChange}, which fires on every change, this dedupes on a
     * signature of the formal cells (their ids, order, and serialized content),
     * so wiring it to bump a signal re-validates only when the formal content
     * actually changes. It is built on `onChange` (and so also reacts to remote
     * edits where the store supports them); a store with no change source leaves
     * it a no-op subscription.
     */
    onChangeFormalContent(callback: () => void): () => void;
    /**
     * Whether this notebook's shape declares a cell type structurally equal to
     * the given object or morphism type. A function written against a shape
     * (e.g. `Notebook<typeof ListShape>`) can be handed a notebook of a
     * narrower theory whose shape only covers some of those types; `supports`
     * tests, at runtime, which of the shape's types this particular notebook
     * actually provides before {@link Notebook.add}ing them.
     *
     * It is a type guard: for a notebook typed over a *union* of shapes, a true
     * result narrows it to just those members that declare `type`, so the
     * subsequent {@link Notebook.add} of that type type-checks. Adding a type
     * not declared by every member without first narrowing is a compile error.
     *
     * `type` is constrained to the shape's {@link DeclaredTypes}: asking about a
     * type no member of the shape could ever declare is itself a compile error,
     * since the guard could never succeed.
     */
    supports<T extends DeclaredTypes<TShape>>(type: T): this is this & AddCapability<T>;
    /**
     * Given a sub-shape (a {@link defineShape} contract bundling several object
     * and morphism types), whether this notebook's shape declares *every* type
     * it declares — the many-types counterpart of the single-type overload.
     *
     * It is a type guard: a true result narrows the notebook to its own type
     * intersected with the combined add-capability of all the sub-shape's
     * declared types, so a single guarded block may {@link Notebook.add} any of
     * them without narrowing each one individually.
     */
    supports<S extends AnyShape>(shape: S): this is this & ShapeAddCapability<S>;
    /**
     * Handles for all cells, in notebook order, as the widest {@link
     * NotebookCell} union: object and morphism handles are the untyped
     * `ObjectCell`/`MorphismCell`. It is deliberately *not* parametrized by the
     * notebook's shape, so a notebook declaring extra cell types stays
     * assignable where a narrower shape is expected (e.g. a notebook with an
     * extra object type handed to a consumer over a union of list shapes); the
     * tradeoff is that the result may include cell types beyond that shape.
     * Recover precise handles with {@link Notebook.cellsOf}.
     *
     * For an analysis notebook the union additionally carries the shape's
     * analysis-cell handles (see {@link AnalysisCellsOf}), so `cell.kind`
     * discriminates a {@link CellKind.Analysis} cell to a precise {@link
     * AnalysisCell}.
     */
    cells(): HasDiagram<TShape> extends true
        ? Array<DiagramCell>
        : Array<NotebookCell | AnalysisCellsOf<TShape>>;
    /**
     * Handles for the notebook's *formal* cells — every cell except rich-text —
     * in notebook order. These are the cells backed by a formal judgment
     * (object, morphism, instantiation, or analysis), i.e. the ones that
     * contribute to {@link Notebook.validate}; rich-text cells are excluded.
     *
     * The element type is {@link Notebook.cells}' union with {@link
     * RichTextCell} removed, so `cell.kind` never discriminates to {@link
     * CellKind.RichText}.
     */
    formalCells(): HasDiagram<TShape> extends true
        ? Array<Exclude<DiagramCell, RichTextCell>>
        : Array<Exclude<NotebookCell | AnalysisCellsOf<TShape>, RichTextCell>>;
    /**
     * Handles for the cells whose object or morphism type is declared by the
     * given sub-shape, precisely typed by that shape: each of its declared
     * object/morphism types contributes its own handle, so `cell.kind`
     * discriminates to a precise `ObjectCell`/`MorphismCell`. Matching is
     * structural, so cells are selected by their stored type value regardless of
     * which shape produced `shape`.
     *
     * A single object or morphism def may be passed directly instead of a
     * shape, selecting just that type's cells as precise
     * `ObjectCell`/`MorphismCell` handles (rich-text cells are excluded).
     *
     * Rich-text cells are included only when the sub-shape opts in with
     * `informal: [RichText]`; otherwise the result carries just the shape's
     * declared object/morphism (and analysis) cells. To select rich-text cells
     * alone, pass {@link RichText}; to iterate every cell, use {@link
     * Notebook.cells}.
     */
    cellsOf(type: RichTextType): Array<RichTextCell>;
    cellsOf(type: InstantiationType): Array<InstantiationCell<Handle>>;
    cellsOf(type: PathEquationType): Array<PathEquationCell>;
    cellsOf<Def extends AnalysisDef>(type: Def): Array<AnalysisCell<Def>>;
    cellsOf<Def extends ObjectDef>(type: Def): Array<ObjectCell<Def>>;
    cellsOf<Def extends MorphismDef>(type: Def): Array<MorphismCell<Def>>;
    cellsOf<S extends AnyShape>(shape: S): Array<ShapeCellsOf<S>>;
    /**
     * Look up the single cell of the given type with the given id. The type
     * selects the precise handle just as {@link Notebook.cellsOf} does, so a
     * cell whose id matches but whose type differs is not returned.
     *
     * Returns a {@link Result}: an `Ok` carrying the cell as `content`, or an
     * `Err` carrying issues when no cell with that id exists or the cell has a
     * different type.
     */
    get(type: RichTextType, id: string): Result<RichTextCell>;
    get(type: InstantiationType, id: string): Result<InstantiationCell<Handle>>;
    get(type: PathEquationType, id: string): Result<PathEquationCell>;
    get<Def extends AnalysisDef>(type: Def, id: string): Result<AnalysisCell<Def>>;
    get<Def extends ObjectDef>(type: Def, id: string): Result<ObjectCell<Def>>;
    get<Def extends MorphismDef>(type: Def, id: string): Result<MorphismCell<Def>>;
    /**
     * Add a cell to the notebook. The kind of cell is selected by the first
     * argument:
     *
     * - {@link RichText} adds a rich-text cell; `args` is `{ content }`.
     * - {@link Instantiation} adds an instantiated model; `args` is
     *   `{ label, model, specializations }`.
     * - {@link PathEquation} adds a path equation (on a shape that declares
     *   `supportsEquations: true`); `args` is `{ label, lhs, rhs }`, each
     *   side an array of the notebook's morphism cells composed left to right.
     *   Each field may be `null` to record an unset label or side.
     * - A morphism type from the shape adds a morphism cell; `args` is
     *   `{ label, from, to }`, with `from`/`to` constrained by the morphism type.
     *   Each field may be `null` to record an unset label or endpoint.
     * - An object type from the shape adds an object cell; `args` is `{ label }`.
     */
    add(type: RichTextType, args: { content: string }): RichTextCell;
    add(type: InstantiationType, args: InstantiationArgs<Handle>): InstantiationCell<Handle>;
    add(
        type: HasPathEquations<TShape> extends true ? PathEquationType : never,
        args: PathEquationArgs,
    ): PathEquationCell;
    add<A extends AnalysisDefOf<TShape>>(type: A): AnalysisCell<A>;
    add<I extends IndividualDefOf<TShape>>(
        type: I,
        args: { label: string; over: ObjectCell<I["object"]> },
    ): IndividualCell<I>;
    add<P extends AspectDefOf<TShape>>(
        type: P,
        args: {
            label?: string;
            from: IndividualCell;
            to: IndividualCell;
            over: MorphismCell<P["morphism"]>;
        },
    ): AspectCell<P>;
    add<M extends ShapeMorphisms<TShape>>(
        type: M,
        args: { label: string | null; from: DomOf<M> | null; to: CodOf<M> | null },
    ): MorphismCell<M>;
    add<O extends ShapeObjects<TShape>>(type: O, args: { label: string }): ObjectCell<O>;
}

/**
 * The value of an inline instance-`add` argument: another {@link Row} (for a
 * mapping) or a literal (for an attribute, auto-materialized as a value row).
 * Loosely typed for now — the key set is not checked against the schema object's
 * outgoing mappings/attributes at compile time; unknown keys throw at runtime.
 */
export type RowValue = Row | string | number | boolean;

/** A reference to an object judgment in the model instantiated by an {@link Instance}. */
export type ModelObjectRef = {
    readonly id: string;
};

/**
 * A row of an {@link Instance}: one record of a schema entity. Rows are never
 * named — a row's identity is the row itself, exposed as {@link Row.id} — and its
 * mapping/attribute values are read from {@link Row.values}. Returned by {@link
 * Instance.add} and {@link Instance.rows}, and passed back as a mapping value to
 * later `add` calls.
 */
export type Row = {
    /** The row's stable id, used to reference it as a mapping target. */
    readonly id: string;
    /** The schema entity (object) this row is a record of. */
    readonly entity: ObjectCell;
    /** Update mapping and attribute values by their schema names. */
    update(args: Record<string, RowValue>): void;
    /**
     * This row's value for one schema morphism, looked up by the morphism's
     * *UUID* (the schema mapping / attribute cell): a mapping's value is the
     * target {@link Row}, an attribute's is the literal it was given, and a
     * cleared or unset morphism is `undefined`. This is the collision-free
     * counterpart to {@link Row.values}: because it keys by UUID, two morphisms
     * sharing a name are read independently.
     */
    get(morphism: { readonly id: string }): RowValue | undefined;
    /**
     * This row's mapping and attribute values keyed by the schema morphism's
     * *UUID*, so morphisms sharing a name never collide (unlike {@link
     * Row.values}). A mapping's value is the target {@link Row}, an attribute's
     * is the literal it was given.
     */
    readonly valuesById: Record<string, RowValue>;
    /**
     * This row's mapping and attribute values, keyed by the schema mapping /
     * attribute *name*: a mapping's value is the target {@link Row}, an
     * attribute's value is the literal it was given.
     *
     * NOTE: names are not unique, so two morphisms sharing a name collide here
     * (the last wins). Prefer {@link Row.get} or {@link Row.valuesById} — which
     * key by the morphism's UUID — whenever a schema may have same-named
     * morphisms. The underlying stored content is always UUID-keyed, so this
     * collision is only in this convenience view, never in the data.
     */
    readonly values: Record<string, RowValue>;
    /**
     * Set (or clear) this row's value for one schema morphism, replacing any
     * previous value for it: a mapping takes a target {@link Row}, an attribute a
     * literal; passing no value clears it. `morphism` is the schema's mapping /
     * attribute cell (e.g. from `schema.cellsOf(Attr)`). Keyed by the morphism's
     * UUID, so same-named morphisms are set independently.
     */
    set(morphism: { readonly id: string }, value?: RowValue): void;
    /**
     * Delete this row and the values drawn out of it. Foreign keys pointing *at*
     * it from other rows are left dangling and become invalid on the next {@link
     * Instance.validate}, mirroring a deleted mapping target.
     */
    delete(): void;
};

/**
 * An *instance* notebook: a database that instantiates a schema, backed by an
 * {@link InstanceDocument} storing an array of *tables* — one table per
 * schema entity, keyed by the schema's generator UUIDs. Obtained from {@link
 * Binder.createInstance}. It speaks in *rows*, not cells: {@link Instance.add}
 * inserts a row for a schema entity and sets its mapping/attribute values
 * inline, and {@link Instance.rows} lists them. It validates against its schema
 * just as a diagram validates in its model.
 */
export type Instance<
    _TShape extends InstanceShape = InstanceShape,
    // oxlint-disable-next-line typescript/no-explicit-any
    Handle = any,
    TModelShape extends AnyShape = AnyShape,
> = Update<{
    title: string;
}> & {
    /** Reactive read of the instance's title. */
    readonly title: string;
    /** The derived instance shape, including its row-bearing object definitions. */
    readonly shape: InstanceShape;
    /** The document theory of the schema this instance is of. */
    readonly theory: string;
    /** The store handle this instance is bound to. */
    readonly handle: Handle;
    /** The validatable model notebook this instance is of. */
    readonly modelNotebook: ValidatableNotebook<Handle, TModelShape>;
    /** The underlying instance document (an array of tables keyed by schema UUIDs). */
    readonly document: InstanceDocument;
    /** Make a detached plain-JS snapshot of the underlying document. */
    dump(): InstanceDocument;
    /**
     * Open a *transaction*: a full instance attached over a private store
     * draft of this document; see {@link NotebookMethods.beginTransaction}. Row
     * mutations through it are invisible here until
     * {@link Transaction.commit}.
     */
    beginTransaction(): Transaction<Instance<_TShape, Handle, TModelShape>>;
    /** Undo a committed transaction; see {@link NotebookMethods.revertCommit}. */
    revertCommit(commit: Commit<unknown>): void;
    /** Subscribe to changes to this instance's document; see {@link Notebook.onChange}. */
    onChange(callback: () => void): () => void;
    /** Subscribe to changes to formal content; see {@link Notebook.onChangeFormalContent}. */
    onChangeFormalContent(callback: () => void): () => void;
    /**
     * Insert a row for the given schema entity. Inline args name the entity's
     * outgoing mappings and attributes: each wires the new row to the arg's
     * value — another {@link Row} for a mapping, or (for an attribute) the
     * literal it points at. Rows are never named. Returns the new row.
     */
    add(entity: ModelObjectRef, args?: Record<string, RowValue>): Row;
    /**
     * All of the instance's rows. Value rows auto-created for attribute
     * literals are not listed. Use {@link Instance.rowsOf} to filter to one
     * schema entity.
     */
    rows(): Row[];
    /**
     * The instance's rows of one schema entity. Value rows auto-created for
     * attribute literals are not listed.
     */
    rowsOf(entity: ModelObjectRef): Row[];
    /**
     * Elaborate the instance and validate it against its schema. Returns a
     * tagged {@link DiagramValidationResult}, like a diagram notebook's.
     */
    validate(): Promise<DiagramValidationResult>;
    /**
     * Observe this instance's validation reactively; see
     * {@link Notebook.onValidate}. Re-validation triggers on changes to the
     * instance's own rows *and* to any document in its schema's instantiation
     * tree — no manual subscription to the schema is needed. Returns an
     * unsubscribe function.
     */
    onValidate(callback: (result: DiagramValidationResult) => void): () => void;
};

/** A diagram shape's individual-def list, defaulted to empty for indexing. */
type IndividualDefOf<TShape extends AnyShape> = ("individuals" extends keyof TShape
    ? NonNullable<TShape["individuals"]>
    : readonly [])[number] &
    IndividualDef;

/** A diagram shape's aspect-def list; see {@link IndividualDefOf}. */
type AspectDefOf<TShape extends AnyShape> = ("aspects" extends keyof TShape
    ? NonNullable<TShape["aspects"]>
    : readonly [])[number] &
    AspectDef;

/**
 * The diagram-only notebook surface, present only when the shape declares
 * `individuals` (see {@link HasDiagram}). A diagram notebook surfaces its model
 * `theory`, iterates {@link DiagramCell}s, and validates against its model. A
 * model or analysis notebook yields no such members.
 */
type DiagramMethods<TShape extends AnyShape> =
    HasDiagram<TShape> extends true
        ? {
              /** The document theory of the model this diagram is drawn in. */
              readonly theory: string;
              /**
               * Elaborate the diagram into its model and validate it there.
               * Returns a tagged {@link DiagramValidationResult}: `Valid` with the
               * elaborated diagram, `Invalid` with the diagram and its validation
               * errors, or `Illformed` when elaboration (or resolving the model)
               * failed.
               */
              validate(): Promise<DiagramValidationResult>;
              /**
               * Observe this diagram's validation reactively; see
               * {@link Notebook.onValidate}. Re-validation triggers on changes
               * to the diagram's own cells and to any document in its host
               * model's instantiation tree. Returns an unsubscribe function.
               */
              onValidate(callback: (result: DiagramValidationResult) => void): () => void;
          }
        : object;

/**
 * The document type a shape's notebook is backed by: an {@link AnalysisDocument}
 * for an analysis shape (one that declares `analyses`), a {@link ModelDocument}
 * otherwise. The base {@link Shape} (optional `analyses`) yields the full
 * {@link Document}, keeping a concrete notebook assignable to the generic one.
 */
type DocumentOf<TShape extends AnyShape> =
    HasAnalyses<TShape> extends true
        ? AnalysisDocument
        : HasDiagram<TShape> extends true
          ? DiagramDocument
          : "analyses" extends keyof TShape
            ? Document
            : "individuals" extends keyof TShape
              ? Document
              : ModelDocument;

/**
 * The analysis-only notebook surface, present only when the shape declares
 * `analyses` (see {@link HasAnalyses}). A model notebook yields no such members,
 * so reading `analysisType` off one is a compile error.
 */
type AnalysisMethods<TShape extends AnyShape> =
    HasAnalyses<TShape> extends true
        ? {
              /** Whether this notebook analyzes a model or a diagram. */
              readonly analysisType: AnalysisType;
          }
        : object;

/**
 * The notebook methods that elaborate into the shape's `getCoreTheory`, present
 * only when the shape declares one (see {@link HasCoreTheory}). A shape without
 * a `getCoreTheory` (e.g. a sub-shape, or a creatable shape that omits it) yields
 * no such methods, so calling them is a compile error rather than a runtime
 * throw.
 */
type CoreTheoryMethods<TShape extends AnyShape, Handle> =
    HasCoreTheory<TShape> extends true
        ? {
              /**
               * Elaborate the notebook into a core model and validate it. Returns a
               * {@link Result}: an `Ok` carrying the validated model as `content`,
               * or an `Err` carrying issues if the model is invalid or elaboration
               * itself failed.
               *
               * Elaborates into the shape's `getCoreTheory`; available only on a shape
               * that declares one.
               *
               * Asynchronous because a notebook may contain instantiation cells,
               * whose referenced models are resolved through the store (which
               * fetches them via {@link DocumentStore.getHandle} and elaborates
               * them against this notebook's core theory, handling any cycles).
               * A notebook with instantiations whose resolution fails validates
               * to an `Err`.
               */
              validate(): Promise<ModelValidationResult<TShape>>;
              /**
               * Observe this notebook's validation reactively: the callback
               * receives a first result asynchronously, then a new one whenever
               * re-validation produces a *different* result — `Ok`s compare by
               * model identity (stable through the elaboration cache), `Err`s
               * by their issues. Re-validation triggers on changes to any
               * document the validation depends on: this notebook *and* every
               * transitively instantiated model, so an edit to an imported
               * notebook is observed without the consumer knowing the
               * dependency graph. Returns an unsubscribe function.
               *
               * This is the intended way to drive a reactive view (e.g. wire
               * the callback to a signal); prefer it over hand-rolling
               * {@link Notebook.onChangeFormalContent} + {@link Notebook.validate},
               * which cannot see cross-document dependencies.
               */
              onValidate(callback: (result: ModelValidationResult<TShape>) => void): () => void;
              /**
               * Migrate the notebook's document to another shape, **mutating it in
               * place**: the underlying document is rewritten to the target theory
               * rather than copied.
               *
               * Returns a {@link Result}: an `Ok` carrying a `Notebook` bound to
               * the target shape (the original handle is now stale, so continue
               * through the returned handle), or an `Err` carrying issues when no
               * migration to the target is defined or the source model cannot be
               * resolved.
               *
               * Available only on a shape that declares a `getCoreTheory`, since a
               * pushforward migration elaborates the model. Asynchronous for the
               * same reason as {@link Notebook.validate}: a notebook with
               * instantiation cells resolves them through the store (via
               * {@link DocumentStore.getHandle}).
               */
              migrateTo<TTarget extends CreatableShape>(
                  targetShape: TTarget,
              ): Promise<Result<Notebook<TTarget, Handle>>>;
          }
        : object;

/** A model shape that supports data instances. */
type SupportsInstancesShape = CreatableShape & {
    readonly getCoreTheory: CoreTheoryLoader;
    readonly Instance: InstanceShape;
};

type SupportsInstancesNotebook<S extends SupportsInstancesShape, Handle> = Notebook<S, Handle> &
    ValidatableNotebook<Handle, S>;

/**
 * Entry points for notebooks over a fixed store. Obtain one with
 * `createBinder`.
 */
export interface Binder<Handle> {
    /**
     * Build an analysis notebook from fresh data. The `of` model must be
     * validatable (its shape must declare a `getCoreTheory`), so it can be
     * resolved by calling `validate()` before each analysis run. The notebook
     * is backed by a real {@link AnalysisDocument} whose `analysisOf` link
     * references `of`.
     */
    createNotebook<S extends AnalysisShape>(
        shape: S,
        data: { title: string; of: ValidatableNotebook<Handle> },
    ): Promise<Notebook<S, Handle>>;
    /**
     * Build a diagram notebook from fresh data. The `in` model must be
     * validatable (its shape must declare a `getCoreTheory`), so the diagram can be
     * elaborated and validated against it. The notebook is backed by a real
     * {@link DiagramDocument} whose `diagramIn` link references `in`.
     */
    createNotebook<S extends DiagramShape>(
        shape: S,
        data: { title: string; in: ValidatableNotebook<Handle> },
    ): Promise<Notebook<S, Handle>>;
    /**
     * Build an *instance* notebook of a schema. `schema` is the schema notebook
     * itself (its shape must be a creatable, `.Instance`-deriving shape); the
     * instance's derived instance shape and `instance-in` link are taken from it,
     * so the caller passes only the schema and a name. The result is an {@link
     * Instance} whose ergonomic `add` takes schema object cells directly. See
     * {@link Instance}.
     */
    createInstance<S extends SupportsInstancesShape>(
        schema: SupportsInstancesNotebook<S, Handle>,
        data: { title: string },
    ): Promise<Instance<S["Instance"], Handle, S>>;
    /**
     * Rebuild an *instance* notebook from a previously {@link Instance.dump}ed
     * {@link InstanceDocument}, re-attaching it over a live `schema` notebook.
     * The dumped document's `instanceOf` link is rewritten to reference
     * `schema`'s current handle, so the instance resolves against and validates
     * in the schema it is reloaded over regardless of the id the schema held when
     * the instance was dumped. Use it to persist and restore an instance (e.g. to
     * `localStorage`) across sessions: dump the schema and instance, reload the
     * schema with {@link Binder.loadNotebook}, then reload the instance here.
     * A dump from before the tables-map representation is discarded and
     * replaced by a fresh empty instance.
     */
    loadInstance<S extends SupportsInstancesShape>(
        schema: SupportsInstancesNotebook<S, Handle>,
        document: InstanceDocument,
    ): Promise<Instance<S["Instance"], Handle, S>>;
    /**
     * Attach an instance notebook to an existing document identified by a
     * {@link DocumentRef}. The reference is resolved through the store without
     * creating storage, and the resolved instance must reference `schema`.
     */
    loadInstanceFromRef<S extends SupportsInstancesShape>(
        schema: SupportsInstancesNotebook<S, Handle>,
        ref: DocumentRef,
    ): Promise<Result<Instance<S["Instance"], Handle, S>>>;
    /**
     * Build a notebook from fresh data. The document seed is constructed
     * internally from `data.title` and the shape's `theory`.
     *
     * Asynchronous because it initializes store storage through
     * {@link DocumentStore.createHandle}, which a backend-backed store fulfils
     * by registering the new document remotely.
     */
    createNotebook<TShape extends CreatableShape>(
        shape: TShape,
        data: { title: string },
    ): Promise<Notebook<TShape, Handle>>;
    /**
     * Build a notebook around an existing plain document by initializing store
     * storage from it. Returns a {@link Result}: an `Ok` carrying the
     * `Notebook`, or an `Err` carrying issues when the document's theory does
     * not match the shape's theory.
     */
    loadNotebook<TShape extends CreatableShape>(
        shape: TShape,
        document: ModelDocument,
    ): Promise<Result<Notebook<TShape, Handle>>>;
    /**
     * Build a notebook around an existing document identified by a
     * {@link DocumentRef}, resolving it through {@link DocumentStore.getHandle} —
     * the abstraction over the frontend's `Api.getDocHandle` (resolve a reference
     * over RPC, then `repo.find` the Automerge document). No store storage is
     * created.
     *
     * Returns a {@link Result}: an `Ok` carrying the `Notebook`, or an `Err`
     * carrying issues when the reference cannot be resolved (the store's
     * `getHandle` returns `undefined`), or when the resolved document's theory
     * does not match the shape's theory. Asynchronous because resolution can hit
     * a remote backend.
     */
    loadNotebookFromRef<TShape extends CreatableShape>(
        shape: TShape,
        ref: DocumentRef,
    ): Promise<Result<Notebook<TShape, Handle>>>;
}

/** Bind a store once, yielding the notebook entry points. */
export function createBinder(): Binder<Document>;
export function createBinder<Handle>(store: DocumentStore<Handle>): Binder<Handle>;
export function createBinder<Handle>(
    store: DocumentStore<Handle> = plainStore as unknown as DocumentStore<Handle>,
): Binder<Handle> {
    // `getDocumentView` is a plain, stable getter: a projecting store builds its
    // projection once in `createHandle`/`getHandle` and returns it here, so the
    // binder reads the store directly without caching projections itself.
    const binder = {
        async createNotebook(
            shape: AnyShape,
            data: {
                title: string;
                of?: ValidatableNotebook<Handle>;
                in?: ValidatableNotebook<Handle>;
            },
        ) {
            if (isAnalysisShape(shape)) {
                const of = data.of;
                if (!of) {
                    throw new Error("Analysis notebook requires an `of` notebook.");
                }
                const ref = store.getDocumentRef(of.handle);
                const seed = newAnalysisDocument({
                    analysisType: shape.analysisType,
                    analysisOf: linkFromRef(ref, "analysis-of"),
                    name: data.title,
                });
                return attachNotebook(store, await store.createHandle(seed), shape);
            }
            if (isDiagramShape(shape)) {
                const model = data.in;
                if (!model) {
                    throw new Error("Diagram notebook requires an `in` model notebook.");
                }
                const ref = store.getDocumentRef(model.handle);
                const seed = newDiagramDocument({
                    diagramIn: linkFromRef(ref, "diagram-in"),
                    name: data.title,
                });
                return attachNotebook(store, await store.createHandle(seed), shape, model.handle);
            }
            const creatableShape = shape as CreatableShape;
            const seed = newModelDocument({ theory: creatableShape.theory });
            seed.name = data.title;
            // The seed is constructed with the shape's own theory, so loading
            // always succeeds.
            return attachNotebook(store, await store.createHandle(seed), creatableShape);
        },
        async createInstance<S extends SupportsInstancesShape>(
            schema: SupportsInstancesNotebook<S, Handle>,
            data: { title: string },
        ) {
            // The instance shape is the schema's own derived `.Instance`,
            // recovered from the shape stamped on the schema notebook at creation.
            const schemaShape = shapeOf(schema);
            const instanceShape = (schemaShape as { Instance?: InstanceShape } | undefined)
                ?.Instance;
            if (!instanceShape) {
                throw new Error(
                    "createInstance requires a schema notebook created from a creatable, " +
                        "`.Instance`-deriving shape.",
                );
            }
            const ref = store.getDocumentRef(schema.handle);
            const seed = newInstanceDocument({
                instanceOf: linkFromRef(ref, "instance-of"),
                name: data.title,
            });
            const validation = await schema.validate();
            return withShape(
                attachInstanceNotebook(
                    store,
                    await store.createHandle(seed),
                    instanceShape,
                    schema,
                    validation.tag === "Ok" ? validation.content : undefined,
                ),
                instanceShape,
            );
        },
        async loadInstance<S extends SupportsInstancesShape>(
            schema: SupportsInstancesNotebook<S, Handle>,
            document: InstanceDocument,
        ) {
            const schemaShape = shapeOf(schema);
            const instanceShape = (schemaShape as { Instance?: InstanceShape } | undefined)
                ?.Instance;
            if (!instanceShape) {
                throw new Error(
                    "loadInstance requires a schema notebook created from a creatable, " +
                        "`.Instance`-deriving shape.",
                );
            }
            const ref = store.getDocumentRef(schema.handle);
            // The dumped document's `instanceOf` link points at whatever id the
            // schema held when it was dumped; rewrite it to the schema we are
            // reloading over so validation resolves the current schema. A
            // document persisted before the tables-map representation (the
            // retired flat-triples and notebook-of-tables shapes) has no
            // `tables`: discard it and start fresh rather than crash on read.
            const tables = (document as { tables?: unknown }).tables;
            const hasTables =
                typeof tables === "object" && tables !== null && !Array.isArray(tables);
            const seed: InstanceDocument = hasTables
                ? {
                      ...document,
                      instanceOf: linkFromRef(ref, "instance-of"),
                  }
                : newInstanceDocument({
                      instanceOf: linkFromRef(ref, "instance-of"),
                      name: document.name,
                  });
            const validation = await schema.validate();
            return withShape(
                attachInstanceNotebook(
                    store,
                    await store.createHandle(seed),
                    instanceShape,
                    schema,
                    validation.tag === "Ok" ? validation.content : undefined,
                ),
                instanceShape,
            );
        },
        async loadInstanceFromRef<S extends SupportsInstancesShape>(
            schema: SupportsInstancesNotebook<S, Handle>,
            ref: DocumentRef,
        ) {
            const schemaShape = shapeOf(schema);
            const instanceShape = (schemaShape as { Instance?: InstanceShape } | undefined)
                ?.Instance;
            if (!instanceShape) {
                throw new Error(
                    "loadInstanceFromRef requires a schema notebook created from a creatable, " +
                        "`.Instance`-deriving shape.",
                );
            }

            const resolved = await store.getHandle(ref);
            if (resolved.tag === "Err") {
                return resolved;
            }
            const handle = resolved.content;
            const document = store.getDocumentView(handle);
            if (document.type !== "instance") {
                return {
                    tag: "Err",
                    content: [
                        {
                            message: `Cannot load document of type "${document.type}" as an instance.`,
                            path: ["type"],
                        },
                    ],
                };
            }

            const schemaRef = store.getDocumentRef(schema.handle);
            if (
                document.instanceOf._id !== schemaRef.id ||
                document.instanceOf._version !== schemaRef.version ||
                document.instanceOf._server !== (schemaRef.server ?? "")
            ) {
                return {
                    tag: "Err",
                    content: [
                        {
                            message:
                                `Cannot load instance of schema "${document.instanceOf._id}" ` +
                                `using schema "${schemaRef.id}".`,
                            path: ["instanceOf"],
                        },
                    ],
                };
            }

            const validation = await schema.validate();
            return {
                tag: "Ok",
                content: withShape(
                    attachInstanceNotebook(
                        store,
                        handle,
                        instanceShape,
                        schema,
                        validation.tag === "Ok" ? validation.content : undefined,
                    ),
                    instanceShape,
                ),
            };
        },
        async loadNotebook<TShape extends CreatableShape>(
            shape: TShape,
            document: ModelDocument,
        ): Promise<Result<Notebook<TShape, Handle>>> {
            if (document.theory !== shape.theory) {
                return {
                    tag: "Err",
                    content: [
                        {
                            message:
                                `Cannot load document with theory "${document.theory}" ` +
                                `using a shape with theory "${shape.theory}".`,
                            path: ["theory"],
                        },
                    ],
                };
            }
            return {
                tag: "Ok",
                content: attachNotebook(store, await store.createHandle(document), shape),
            };
        },
        async loadNotebookFromRef<TShape extends CreatableShape>(
            shape: TShape,
            ref: DocumentRef,
        ): Promise<Result<Notebook<TShape, Handle>>> {
            const resolved = await store.getHandle(ref);
            if (resolved.tag === "Err") {
                return resolved;
            }
            const handle = resolved.content;
            const document = store.getDocumentView(handle);
            const theory = document.type === "model" ? document.theory : undefined;
            if (theory !== shape.theory) {
                return {
                    tag: "Err",
                    content: [
                        {
                            message:
                                `Cannot load document with theory "${theory}" ` +
                                `using a shape with theory "${shape.theory}".`,
                            path: ["theory"],
                        },
                    ],
                };
            }
            return { tag: "Ok", content: attachNotebook(store, handle, shape) };
        },
    };
    return binder as unknown as Binder<Handle>;
}
