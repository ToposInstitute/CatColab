import type {
    Analysis,
    AnalysisType,
    Cell,
    Document,
    Link,
    Modality,
    ModelJudgment,
    Ob,
    SpecializeModel,
} from "catcolab-document-types";
import type { DblModel, DblTheory } from "catlog-wasm";
import {
    duplicateModelJudgment,
    type ModelDocument,
    newInstantiatedModel,
    newModelDocument,
    newMorphismDecl,
    newObjectDecl,
} from "../model";
import { duplicateCell, newFormalCell, newRichTextCell } from "../notebook";
import { type AnalysisDocument, newAnalysisCell, newAnalysisDocument } from "./analysis";
import {
    type AnalysisCell,
    type AnalysisCellsOf,
    type AnalysisDef,
    type AnalysisDefOf,
    type AnalysisShape,
    type AddCapability,
    type AnyShape,
    CellKind,
    type CodOf,
    type CreatableShape,
    type DeclaredMorphisms,
    type DeclaredObjects,
    type DeclaredTypes,
    type DeclaresMorphism,
    type DeclaresObject,
    defineObject,
    type DomOf,
    encodeEndpoint,
    encodeObjectRef,
    endpointApplyOp,
    endpointListModality,
    type HasAnalyses,
    type HasCoreTheory,
    type InstantiationArgs,
    type InstantiationCell,
    type InstantiationSpecialization,
    type InstantiationType,
    isAnalysisShape,
    isInstantiationType,
    isRichTextType,
    type ModelValidationResult,
    type MorEndpointMeta,
    type MorphismCell,
    type MorphismDef,
    type NotebookCell,
    type ObjectCell,
    type ObjectDef,
    type RichTextCell,
    type RichTextType,
    type Reorder,
    type ParamsOf,
    type OutputOf,
    sameTypeValue,
    type ShapeAddCapability,
    type ShapeMorphisms,
    type ShapeObjects,
    type Update,
    type ValidatableNotebook,
} from "./definitions";
import {
    type DocumentStore,
    plainDocumentId,
    plainStore,
    registerCoreTheory,
    resolveModelInStore,
} from "./store";

/**
 * A stable string capturing the document's *formal* cells — every cell except
 * rich text — in notebook order, including each cell's id and serialized
 * content. {@link Notebook.onChangeFormalContent} compares this signature across
 * changes and fires only when it differs, so adding, removing, reordering, or
 * editing a formal cell is reported, while a change confined to rich text (or
 * any other non-formal field) leaves it unchanged. Content is included so a
 * formal cell edited in place (e.g. renaming an object) still re-reports.
 */
const formalCellsSignature = (document: Document): string => {
    const parts: Array<string> = [];
    for (const cellId of document.notebook.cellOrder) {
        const cell = document.notebook.cellContents[cellId];
        if (cell?.tag === "formal") {
            parts.push(`${cellId}:${JSON.stringify(cell.content)}`);
        }
    }
    return parts.join("\u0000");
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
    const doc = store.viewDocument(handle) as AnalysisDocument;
    const change = (fn: (doc: AnalysisDocument) => void) =>
        store.changeDocument(handle, fn as (doc: Document) => void);

    /** The analysis def for a given id, looked up in the shape's `analyses`. */
    const defForId = (id: string): AnalysisDef | undefined =>
        (shape.analyses ?? []).find((def) => def.id === id);

    const readCell = (cellId: string): Cell<Analysis> | undefined =>
        doc.notebook.cellContents[cellId] as Cell<Analysis> | undefined;

    /** Read an analysis cell's stored params, or `{}` if missing/non-formal. */
    const readParams = (cellId: string): Record<string, unknown> => {
        const cell = readCell(cellId);
        if (cell?.tag !== "formal") {
            return {};
        }
        return cell.content.content;
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
                return (readCell(cellId) as { content?: string } | undefined)?.content;
            },
            update(u: { content?: string }) {
                change((d) => {
                    Object.assign(d.notebook.cellContents[cellId] as object, u);
                });
            },
            ...reorderMethods(cellId),
        }) as unknown as RichTextCell;

    const analysisHandle = <Def extends AnalysisDef>(cellId: string, def: Def): AnalysisCell<Def> =>
        ({
            kind: CellKind.Analysis,
            get id() {
                return cellId;
            },
            type: def,
            get params() {
                return readParams(cellId) as ParamsOf<Def>;
            },
            update(partial: Partial<ParamsOf<Def>>) {
                change((d) => {
                    const cell = d.notebook.cellContents[cellId] as Cell<Analysis> | undefined;
                    if (cell?.tag === "formal") {
                        Object.assign(cell.content.content, partial);
                    }
                });
            },
            async run() {
                const params = readParams(cellId) as ParamsOf<Def>;
                const model = await resolveModelInStore(store, doc.analysisOf);
                return def.run(model, params) as Promise<OutputOf<Def>>;
            },
            ...reorderMethods(cellId),
        }) as unknown as AnalysisCell<Def>;

    const impl = {
        get name() {
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
        update(u: { name?: string }) {
            change((d) => {
                Object.assign(d, u);
            });
        },
        onChange(callback: () => void): () => void {
            return store.subscribe?.(handle, callback) ?? (() => {});
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
        add(type: unknown, args?: { content?: string }) {
            if (isRichTextType(type)) {
                const cell = newRichTextCell((args as { content: string }).content);
                change((d) => {
                    d.notebook.cellContents[cell.id] = cell as unknown as Cell<Analysis>;
                    d.notebook.cellOrder.push(cell.id);
                });
                return richTextHandle(cell.id);
            }
            const def = type as AnalysisDef;
            const cell = newFormalCell(
                newAnalysisCell(def.id, def.initialContent() as Record<string, unknown>),
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
                const content = cell.content as Analysis;
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

function attachNotebook<TShape extends AnyShape, Handle>(
    store: DocumentStore<Handle>,
    handle: Handle,
    shape: TShape,
): Notebook<TShape, Handle> {
    if (isAnalysisShape(shape)) {
        return attachAnalysisNotebook(store, handle, shape) as Notebook<TShape, Handle>;
    }
    const doc = store.viewDocument(handle) as ModelDocument;
    const change = (fn: (doc: ModelDocument) => void) =>
        store.changeDocument(handle, fn as (doc: Document) => void);
    const copy = <T>(value: T): T => store.copyValue(handle, value);
    const isPlainStore = (store as DocumentStore<unknown>) === plainStore;

    /**
     * Elaborate this notebook's own model by minting a link to its own handle
     * and resolving it through the shared resolver against the store. Resolution
     * is the recursive workhorse — it walks this notebook's instantiations
     * (resolving each via {@link DocumentStore.getDocument}), and elaborates
     * against the document's core theory (via {@link DocumentStore.coreTheoryFor})
     * — so `validate` and `migrateTo` delegate here rather than building the
     * instantiated map and elaborating themselves. The shape's `coreTheory` is
     * registered first so the store can elaborate this document (and others of
     * its theory) by `theory` id. Returns the elaborated {@link DblModel}, or an
     * error string when the handle has no stable link or resolution rejects.
     */
    const resolveSelf = async (coreTheory: DblTheory): Promise<DblModel | { error: string }> => {
        registerCoreTheory(doc.theory, coreTheory);
        const ref = store.linkForHandle(handle);
        if (!ref) {
            return { error: "the store cannot mint a link for this notebook's handle" };
        }
        try {
            return await resolveModelInStore(store, { ...ref, type: "instantiation" });
        } catch (e) {
            return { error: `Failed to resolve instantiated model: ${String(e)}` };
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
        const ref = store.linkForHandle(model.handle);
        return ref ? { ...ref, type: "instantiation" } : null;
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
            get name() {
                return readCellContent<{ name: string }>(cellId)?.name;
            },
            update(u: { name?: string }) {
                change((d) => {
                    Object.assign(
                        (d.notebook.cellContents[cellId] as { content: object }).content,
                        u,
                    );
                });
            },
            duplicate() {
                return objectHandle(appendDuplicate(cellId), type);
            },
            ...reorderMethods(cellId),
        }) as unknown as ObjectCell<Def>;

    const objectHandleForId = (objectId: string): ObjectCell => {
        for (const candidateCellId of doc.notebook.cellOrder) {
            const cell = doc.notebook.cellContents[candidateCellId];
            if (cell?.tag !== "formal" || cell.content.tag !== "object") {
                continue;
            }
            if (cell.content.id === objectId) {
                return objectHandle(candidateCellId, defineObject(cell.content.obType));
            }
        }
        throw new Error(`No object cell found for endpoint '${objectId}'.`);
    };

    /** Flatten any stored endpoint object into the object-cell handles it
    references, regardless of tensor/list wrapping. */
    const decodeEndpointObjects = (value: Ob | null): ObjectCell[] => {
        if (!value) {
            return [];
        }
        switch (value.tag) {
            case "Basic":
                return [objectHandleForId(value.content)];
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
            get name() {
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
            update(u: { name?: string; from?: unknown; to?: unknown }) {
                change((d) => {
                    const content = (
                        d.notebook.cellContents[cellId] as {
                            content: { name: string; dom: Ob | null; cod: Ob | null };
                        }
                    ).content;
                    if (u.name !== undefined) {
                        content.name = u.name;
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

    const richTextHandle = (cellId: string): RichTextCell =>
        ({
            kind: CellKind.RichText,
            id: cellId,
            get content() {
                return readCellContent<string>(cellId);
            },
            update(u: { content?: string }) {
                change((d) => {
                    Object.assign(d.notebook.cellContents[cellId] as object, u);
                });
            },
            ...reorderMethods(cellId),
        }) as unknown as RichTextCell;

    const instantiationHandle = (cellId: string): InstantiationCell<Handle> =>
        ({
            kind: CellKind.Instantiation,
            get id() {
                return readCellContent<{ id: string }>(cellId)?.id;
            },
            get name() {
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
                    if (u.name !== undefined) {
                        content.name = u.name;
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
        (shape.morphisms ?? []).some((t) => sameTypeValue(t, def));

    const isShapeObject = (def: ObjectDef): boolean =>
        (shape.objects ?? []).some((t) => sameTypeValue(t, def));

    const addObjectCell = (def: ObjectDef, name: string): ObjectCell => {
        const judgment = newObjectDecl(def.obType);
        judgment.name = name;
        const formalCell = newFormalCell(judgment);
        change((d) => {
            d.notebook.cellContents[formalCell.id] = formalCell;
            d.notebook.cellOrder.push(formalCell.id);
        });
        return objectHandle(formalCell.id, def);
    };

    const addMorphismCell = (
        def: MorphismDef,
        args: { name: string; from?: unknown; to?: unknown },
    ): MorphismCell => {
        const judgment = newMorphismDecl(def.morType);
        judgment.name = args.name;
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
        judgment.name = args.name;
        judgment.specializations = encodeSpecializations(args.specializations);
        const formalCell = newFormalCell(judgment);
        change((d) => {
            d.notebook.cellContents[formalCell.id] = formalCell;
            d.notebook.cellOrder.push(formalCell.id);
        });
        return instantiationHandle(formalCell.id);
    };

    const impl = {
        get name() {
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
            return store.subscribe?.(handle, callback) ?? (() => {});
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
        async validate(): Promise<ModelValidationResult> {
            const theory = shape.coreTheory;
            if (!theory) {
                throw new Error("validate() needs a core theory: this shape has no `coreTheory`.");
            }
            // Delegate elaboration to the store: mint a link to this notebook's
            // own handle and resolve it. The store walks this notebook's
            // instantiations (resolving each recursively) and elaborates against
            // the registered core theory; `validate` only splits the resulting
            // model into Valid/Invalid (and a rejection into Illformed).
            const resolved = await resolveSelf(theory);
            if ("error" in resolved) {
                return { tag: "Illformed", model: null, error: resolved.error };
            }
            const model = resolved;
            const result = model.validate();
            if (result.tag === "Ok") {
                return { tag: "Valid", model };
            }
            return { tag: "Invalid", model, errors: result.content };
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
                return attachNotebook(store, handle, targetShape);
            }

            // Pushforward migration: transport the elaborated model along the
            // theory morphism, then re-type each cell from the migrated model.
            const migration = (shape.migrations ?? []).find((m) => m.target === targetShape.theory);
            if (!migration) {
                throw new Error(
                    `No migration defined from "${shape.theory}" to "${targetShape.theory}".`,
                );
            }
            if (!shape.coreTheory || !targetShape.coreTheory) {
                throw new Error(
                    "Migration needs the source and target core theories; one shape has none.",
                );
            }

            // Obtain the source model through the store (same recursive
            // resolution as `validate`), then transport it along the morphism.
            const resolved = await resolveSelf(shape.coreTheory);
            if ("error" in resolved) {
                throw new Error(
                    `Cannot migrate notebook from "${shape.theory}" to ` +
                        `"${targetShape.theory}": ${resolved.error}`,
                );
            }
            const model = resolved;

            const migrated = migration.migrate(model, targetShape.coreTheory);
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
            return attachNotebook(store, handle, targetShape);
        },
        update(u: { name?: string }) {
            change((d) => {
                Object.assign(d, u);
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
                    case "morphism": {
                        // Recover each list endpoint's `apply` op and modality
                        // from the stored `App(apply, List(modality, …))`,
                        // inverting the encoding in `encodeEndpoint`, so the
                        // reconstructed def matches the one its `MorphismDef`
                        // declares (see `cellsOf`).
                        const endpointMeta = (ob: Ob | null): MorEndpointMeta | undefined => {
                            const apply = endpointApplyOp(ob);
                            return apply
                                ? { apply, modality: endpointListModality(ob) ?? undefined }
                                : undefined;
                        };
                        return morphismHandle(cellId, {
                            tag: "morphism",
                            morType: judgment.morType,
                            domain: endpointMeta(judgment.dom),
                            codomain: endpointMeta(judgment.cod),
                        });
                    }
                    case "instantiation":
                        return instantiationHandle(cellId);
                    default:
                        throw new Error(`Unsupported judgment tag: ${judgment.tag}`);
                }
            });
        },
        formalCells(): Array<Exclude<NotebookCell, RichTextCell>> {
            return impl.cells().filter((cell) => cell.kind !== CellKind.RichText) as Array<
                Exclude<NotebookCell, RichTextCell>
            >;
        },
        cellsOf(
            arg: RichTextType | InstantiationType | ObjectDef | MorphismDef | AnyShape,
        ): Array<NotebookCell> {
            // `RichText` selects just the rich-text cells.
            if (isRichTextType(arg)) {
                return impl.cells().filter((cell) => cell.kind === CellKind.RichText);
            }
            if (isInstantiationType(arg)) {
                return impl.cells().filter((cell) => cell.kind === CellKind.Instantiation);
            }
            // A def carries an "object"/"morphism" `tag`; a shape does not. A
            // single def selects only its own cells (rich-text excluded), while a
            // shape also includes rich-text cells.
            const isDef = "tag" in arg;
            const shape: AnyShape = isDef
                ? arg.tag === "object"
                    ? { objects: [arg] }
                    : { morphisms: [arg] }
                : arg;
            const objectDefs = shape.objects ?? [];
            const morphismDefs = shape.morphisms ?? [];
            return impl.cells().filter((cell) => {
                if (cell.kind === CellKind.RichText) {
                    return !isDef;
                }
                if (cell.kind === CellKind.Object) {
                    const type = (cell as { type?: unknown }).type;
                    return objectDefs.some((def) => sameTypeValue(type, def));
                }
                if (cell.kind === CellKind.Morphism) {
                    const type = (cell as { type?: unknown }).type;
                    return morphismDefs.some((def) => sameTypeValue(type, def));
                }
                return false;
            });
        },
        get(
            arg: RichTextType | InstantiationType | ObjectDef | MorphismDef,
            id: string,
        ): NotebookCell | undefined {
            return impl.cellsOf(arg).find((cell) => cell.id === id);
        },
        add(
            type: unknown,
            args: {
                content?: string;
                name?: string;
                from?: unknown;
                to?: unknown;
                model?: ValidatableNotebook<Handle> | null;
                specializations?: readonly InstantiationSpecialization[];
            },
        ) {
            if (isRichTextType(type)) {
                const cell = newRichTextCell((args as { content: string }).content);
                change((d) => {
                    d.notebook.cellContents[cell.id] = cell;
                    d.notebook.cellOrder.push(cell.id);
                });
                return richTextHandle(cell.id);
            }
            if (isInstantiationType(type)) {
                return addInstantiationCell(args as InstantiationArgs<Handle>);
            }
            const def = type as ObjectDef | MorphismDef;
            if (def.tag === "morphism") {
                return addMorphismCell(def, args as { name: string });
            }
            return addObjectCell(def, (args as { name: string }).name);
        },
    };

    const notebook = impl as unknown as Notebook<TShape, Handle>;

    if (isPlainStore) {
        // Ensure the document is reachable by id for the plain store's resolver,
        // and register its core theory so any document of this theory can be
        // elaborated by `theory` id (the plain store has no theory of its own).
        plainDocumentId(handle as Document);
        if (shape.coreTheory) {
            registerCoreTheory((doc as ModelDocument).theory, shape.coreTheory);
        }
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
export type Notebook<TShape extends AnyShape = AnyShape, Handle = Document> = Update<{
    name: string;
}> & {
    /**
     * Phantom carrier of the shape's declared *object* types, present only in
     * the type: the runtime object never provides it. It exists so shape
     * assignability is decided by the declared cell types rather than collapsing
     * under the method-bivariance of the rest of the surface. Declared as a
     * *method* so its parameter is compared bivariantly: a notebook is assignable
     * to another when its declared object types are a subset of, or a superset
     * of, the target's. Objects and morphisms are carried on *separate* members
     * (see {@link __morphismShapeBound}) so the two axes are related
     * independently — a notebook that declares a superset of the target's
     * objects (extra object types alongside the shared ones) and a subset of its
     * morphisms is still accepted, rather than being rejected because the
     * combined type set is neither subset nor superset.
     */
    __objectShapeBound?(declared: DeclaredObjects<TShape>): void;
    /**
     * Phantom carrier of the shape's declared *morphism* types; the morphism-side
     * counterpart of {@link __objectShapeBound}, compared bivariantly the same
     * way. Relating morphisms independently of objects is what rejects a notebook
     * whose morphisms are foreign to the target (e.g. `SimpleOlog`, whose
     * `Hom`-over-`Basic` aspect is neither a subset nor a superset of a list
     * shape's morphisms) while accepting one that merely adds extra object types.
     */
    __morphismShapeBound?(declared: DeclaredMorphisms<TShape>): void;
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
    /** Reactive read of the notebook's name. */
    readonly name: string;
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
     * A store with no change source leaves this a no-op subscription (see {@link
     * DocumentStore.subscribe}).
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
    supports<T extends DeclaredTypes<TShape>>(
        type: T,
    ): this is Notebook<TShape, Handle> & AddCapability<T>;
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
    supports<S extends AnyShape>(
        shape: S,
    ): this is Notebook<TShape, Handle> & ShapeAddCapability<S>;
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
    cells(): Array<NotebookCell | AnalysisCellsOf<TShape>>;
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
    formalCells(): Array<Exclude<NotebookCell | AnalysisCellsOf<TShape>, RichTextCell>>;
    /**
     * Handles for the cells whose object or morphism type is declared by the
     * given sub-shape, precisely typed by that shape: each of its declared
     * object/morphism types contributes its own handle, so `cell.kind`
     * discriminates to a precise `ObjectCell`/`MorphismCell`. Rich-text cells
     * are always included (they belong to no shape), so an editor can render
     * them alongside the shape's typed cells. Matching is structural, so cells
     * are selected by their stored type value regardless of which shape produced
     * `shape`.
     *
     * A single object or morphism def may be passed directly instead of a
     * shape, selecting just that type's cells as precise
     * `ObjectCell`/`MorphismCell` handles (rich-text cells are excluded).
     *
     * Passing {@link RichText} selects just the notebook's rich-text cells.
     */
    cellsOf(type: RichTextType): Array<RichTextCell>;
    cellsOf(type: InstantiationType): Array<InstantiationCell<Handle>>;
    cellsOf<Def extends AnalysisDef>(type: Def): Array<AnalysisCell<Def>>;
    cellsOf<Def extends ObjectDef>(type: Def): Array<ObjectCell<Def>>;
    cellsOf<Def extends MorphismDef>(type: Def): Array<MorphismCell<Def>>;
    cellsOf<S extends AnyShape>(shape: S): Array<NotebookCell<S>>;
    /**
     * Handle for the single cell of the given type with the given id, or
     * `undefined` if no such cell exists. The type selects the precise handle
     * just as {@link Notebook.cellsOf} does, so a cell whose id matches but
     * whose type differs is not returned.
     */
    get(type: RichTextType, id: string): RichTextCell | undefined;
    get(type: InstantiationType, id: string): InstantiationCell<Handle> | undefined;
    get<Def extends AnalysisDef>(type: Def, id: string): AnalysisCell<Def> | undefined;
    get<Def extends ObjectDef>(type: Def, id: string): ObjectCell<Def> | undefined;
    get<Def extends MorphismDef>(type: Def, id: string): MorphismCell<Def> | undefined;
    /**
     * Add a cell to the notebook. The kind of cell is selected by the first
     * argument:
     *
     * - {@link RichText} adds a rich-text cell; `args` is `{ content }`.
     * - {@link Instantiation} adds an instantiated model; `args` is
     *   `{ name, model, specializations }`.
     * - A morphism type from the shape adds a morphism cell; `args` is
     *   `{ name, from, to }`, with `from`/`to` constrained by the morphism type.
     * - An object type from the shape adds an object cell; `args` is `{ name }`.
     */
    add(type: RichTextType, args: { content: string }): RichTextCell;
    add(type: InstantiationType, args: InstantiationArgs<Handle>): InstantiationCell<Handle>;
    add<A extends AnalysisDefOf<TShape>>(type: A): AnalysisCell<A>;
    add<M extends ShapeMorphisms<TShape>>(
        type: M,
        args: { name: string; from: DomOf<M>; to: CodOf<M> },
    ): MorphismCell<M>;
    add<O extends ShapeObjects<TShape>>(type: O, args: { name: string }): ObjectCell<O>;
} & CoreTheoryMethods<TShape, Handle> &
    AnalysisMethods<TShape>;

/**
 * The document type a shape's notebook is backed by: an {@link AnalysisDocument}
 * for an analysis shape (one that declares `analyses`), a {@link ModelDocument}
 * otherwise. The base {@link Shape} (optional `analyses`) yields the full
 * {@link Document}, keeping a concrete notebook assignable to the generic one.
 */
type DocumentOf<TShape extends AnyShape> =
    HasAnalyses<TShape> extends true
        ? AnalysisDocument
        : "analyses" extends keyof TShape
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
 * The notebook methods that elaborate into the shape's `coreTheory`, present
 * only when the shape declares one (see {@link HasCoreTheory}). A shape without
 * a `coreTheory` (e.g. a sub-shape, or a creatable shape that omits it) yields
 * no such methods, so calling them is a compile error rather than a runtime
 * throw.
 */
type CoreTheoryMethods<TShape extends AnyShape, Handle> =
    HasCoreTheory<TShape> extends true
        ? {
              /**
               * Elaborate the notebook into a core model and validate it. Returns a
               * tagged result: `Valid` with the model, `Invalid` with the model and
               * its validation errors, or `Illformed` if elaboration itself failed.
               *
               * Elaborates into the shape's `coreTheory`; available only on a shape
               * that declares one.
               *
               * Asynchronous because a notebook may contain instantiation cells,
               * whose referenced models are resolved through the store (which
               * fetches them via {@link DocumentStore.getDocument} and elaborates
               * them against {@link DocumentStore.coreTheoryFor}, handling any
               * cycles). A notebook with instantiations whose resolution fails
               * validates as `Illformed`.
               */
              validate(): Promise<ModelValidationResult>;
              /**
               * Migrate the notebook's document to another shape, **mutating it in
               * place**: the underlying document is rewritten to the target theory
               * rather than copied. Returns a new notebook handle bound to the
               * target shape; the original handle is now stale, so continue through
               * the returned handle. Throws if no migration to the target is
               * defined.
               *
               * Available only on a shape that declares a `coreTheory`, since a
               * pushforward migration elaborates the model. Asynchronous for the
               * same reason as {@link Notebook.validate}: a notebook with
               * instantiation cells resolves them through the store (via
               * {@link DocumentStore.getDocument} and
               * {@link DocumentStore.coreTheoryFor}).
               */
              migrateTo<TTarget extends CreatableShape>(
                  targetShape: TTarget,
              ): Promise<Notebook<TTarget, Handle>>;
          }
        : object;

/**
 * Entry points for notebooks over a fixed store. Obtain one with
 * `createBinder`.
 */
export interface Binder<Handle> {
    /**
     * Build an analysis notebook from fresh data. The `of` model must be
     * validatable (its shape must declare a `coreTheory`), so it can be
     * resolved by calling `validate()` before each analysis run. The notebook
     * is backed by a real {@link AnalysisDocument} whose `analysisOf` link
     * references `of`.
     */
    createNotebook<S extends AnalysisShape>(
        shape: S,
        data: { name: string; of: ValidatableNotebook<Handle> },
    ): Notebook<S, Handle>;
    /**
     * Build a notebook from fresh data. The document seed is constructed
     * internally from `data.name` and the shape's `theory`.
     */
    createNotebook<TShape extends CreatableShape>(
        shape: TShape,
        data: { name: string },
    ): Notebook<TShape, Handle>;
    /**
     * Build a notebook around an existing plain document by initializing store
     * storage from it. Throws if the document's theory does not match the
     * shape's theory.
     */
    loadNotebook<TShape extends CreatableShape>(
        shape: TShape,
        document: ModelDocument,
    ): Notebook<TShape, Handle>;
    /**
     * Build a notebook around an existing store handle, e.g. an Automerge
     * `DocHandle` found in a repo. No store storage is created.
     */
    loadNotebookFromHandle<TShape extends CreatableShape>(
        shape: TShape,
        handle: Handle,
    ): Notebook<TShape, Handle>;
}

/** Bind a store once, yielding the notebook entry points. */
export function createBinder<Handle>(store: DocumentStore<Handle>): Binder<Handle> {
    const binder = {
        createNotebook(shape: AnyShape, data: { name: string; of?: ValidatableNotebook<Handle> }) {
            if (isAnalysisShape(shape)) {
                const of = data.of;
                if (!of) {
                    throw new Error("Analysis notebook requires an `of` notebook.");
                }
                const ref = store.linkForHandle(of.handle);
                if (!ref) {
                    throw new Error(
                        "Cannot create an analysis notebook: the store cannot mint a " +
                            "link for the analyzed model's handle.",
                    );
                }
                const seed = newAnalysisDocument({
                    analysisType: shape.analysisType,
                    analysisOf: { ...ref, type: "analysis-of" },
                    name: data.name,
                });
                return attachNotebook(store, store.createHandle(seed), shape);
            }
            const creatableShape = shape as CreatableShape;
            const seed = newModelDocument({ theory: creatableShape.theory });
            seed.name = data.name;
            return binder.loadNotebook(creatableShape, seed);
        },
        loadNotebook<TShape extends CreatableShape>(
            shape: TShape,
            document: ModelDocument,
        ): Notebook<TShape, Handle> {
            if (document.theory !== shape.theory) {
                throw new Error(
                    `Cannot load document with theory "${document.theory}" ` +
                        `using a shape with theory "${shape.theory}".`,
                );
            }
            return attachNotebook(store, store.createHandle(document), shape);
        },
        loadNotebookFromHandle<TShape extends CreatableShape>(
            shape: TShape,
            handle: Handle,
        ): Notebook<TShape, Handle> {
            return attachNotebook(store, handle, shape);
        },
    };
    return binder as unknown as Binder<Handle>;
}

/** A ready-made binder over the plain in-memory store. */
export const binder: Binder<Document> = createBinder(plainStore);
