import type { MorType, ObType } from "catcolab-document-types";
import type { Cell, ModelJudgment } from "catcolab-document-types";
import {
    duplicateModelJudgment,
    type ModelDocument,
    newModelDocument,
    newMorphismDecl,
    newObjectDecl,
} from "../model";
import { duplicateCell, newFormalCell, newRichTextCell } from "../notebook";

export { type ModelDocument, newModelDocument } from "../model";

/**
 * A notebook backend abstracts the storage that notebooks operate over. A
 * backend is a stateless object working on handles of its own choosing: a
 * plain document, a Solid store, an Automerge `DocHandle`, etc. Handles are
 * produced by `createHandle` and passed back into the other methods.
 */
export interface NotebookBackend<Handle> {
    /** Initialize a backend handle from an initial document. */
    createHandle(initialDoc: ModelDocument): Handle;
    /** Read view of the document for a handle (reactive where applicable). */
    viewDocument(handle: Handle): ModelDocument;
    /** Apply a mutation by mutating a draft document. */
    changeDocument(handle: Handle, fn: (doc: ModelDocument) => void): void;
    /** Make a detached plain-JS copy of a backend-owned value before cloning it. */
    copyValue?<T>(handle: Handle, value: T): T;
}

/** A plain in-memory backend whose handle is the document itself. */
export const plainBackend: NotebookBackend<ModelDocument> = {
    createHandle: (initialDoc) => initialDoc,
    viewDocument: (handle) => handle,
    changeDocument: (handle, fn) => fn(handle),
};

const richTextKind: unique symbol = Symbol("richText");
const objectKind: unique symbol = Symbol("object");
const morphismKind: unique symbol = Symbol("morphism");

/** Precise discriminants for notebook cell handles. */
export const CellKind = {
    RichText: richTextKind,
    Object: objectKind,
    Morphism: morphismKind,
} as const;

/**
 * Runtime discriminant attached to cell-type values by the `objectType` and
 * `morphismType` factories. A symbol key is invisible to `Object.keys` and
 * JSON, so branded type values still compare structurally equal to the bare
 * `ObType`/`MorType` expressions stored in documents. Being required at the
 * type level, it also keeps `ObjectType` and `MorphismType` disjoint.
 */
const typeKind: unique symbol = Symbol("typeKind");

export type ObjectType<Name extends string> = ObType & {
    readonly [typeKind]: "object";
    readonly objectTypeName?: Name;
};
export type MorphismType<Dom, Cod, Name extends string> = MorType & {
    readonly [typeKind]: "morphism";
    readonly morphismTypeName?: Name;
    readonly dom?: Dom;
    readonly cod?: Cod;
};

/** Any cell type that can belong to a logic. */
export type CellType = ObjectType<string> | MorphismType<unknown, unknown, string>;

const richTextTypeBrand: unique symbol = Symbol("richTextType");

/**
 * The sentinel cell-type used to add rich-text cells to a notebook. Pass it
 * as the first argument to {@link ModelNotebook.add}; the second argument is
 * `{ content: string }`. Unlike `ObjectType` and `MorphismType`, `RichText`
 * is logic-agnostic and lives at the top level.
 */
export type RichTextType = { readonly [richTextTypeBrand]: true };

/** The singleton {@link RichTextType} value. */
export const RichText: RichTextType = { [richTextTypeBrand]: true };

const isRichTextType = (value: unknown): value is RichTextType =>
    typeof value === "object" &&
    value !== null &&
    (value as RichTextType)[richTextTypeBrand] === true;

type FieldError<Key extends PropertyKey, Message extends string> = {
    readonly [K in `Type error: ${Key & string}`]: Message;
};

type UnionToIntersection<T> = (T extends unknown ? (arg: T) => void : never) extends (
    arg: infer U,
) => void
    ? U
    : never;

type ValidateField<Expected, Actual, Key extends PropertyKey> = Actual extends Expected
    ? unknown
    : Expected extends readonly unknown[]
      ? Actual extends readonly unknown[]
          ? FieldError<Key, "Expected an array of objects of the correct shape.">
          : FieldError<Key, "Expected an array, not a single object.">
      : Actual extends readonly unknown[]
        ? FieldError<Key, "Expected a single object, not an array.">
        : FieldError<Key, "Unexpected value shape.">;

type ValidateFields<Expected, Actual> = UnionToIntersection<
    {
        [Key in keyof Actual & keyof Expected]: ValidateField<Expected[Key], Actual[Key], Key>;
    }[keyof Actual & keyof Expected]
>;

type Update<T> = {
    update<TArgs extends Partial<Record<keyof T, unknown>>>(
        args: TArgs & ValidateFields<T, TArgs>,
    ): void;
};

/** Methods shared by all cell handles for re-ordering and removal. Cells
are identified by id at the moment the change applies, so operations stay
valid even if the notebook was edited after the handle was obtained. */
type Reorder = {
    /** Move this cell one position earlier; no-op if already first. */
    moveUp(): void;
    /** Move this cell one position later; no-op if already last. */
    moveDown(): void;
    /**
     * Move this cell to the given index, interpreted after the cell is
     * removed from its current position. Out-of-range targets clamp to the
     * ends of the notebook.
     */
    moveTo(index: number): void;
    /**
     * Remove this cell from the notebook. After deletion, reads of the
     * handle's fields (e.g. `name`, `content`) will throw. Deleting a cell
     * that is no longer in the notebook is a silent no-op.
     */
    delete(): void;
};

export type ObjectCell<TType extends ObjectType<string>> = Update<{ name: string }> &
    Reorder & {
        readonly kind: typeof CellKind.Object;
        readonly id: string;
        readonly type: TType;
        readonly name: string;
        duplicate(): ObjectCell<TType>;
    };

type DomOf<TType> = TType extends MorphismType<infer Dom, unknown, string> ? Dom : never;
type CodOf<TType> = TType extends MorphismType<unknown, infer Cod, string> ? Cod : never;

type MorphismArgs<TType extends MorphismType<unknown, unknown, string>> = {
    name: string;
    dom: DomOf<TType>;
    cod: CodOf<TType>;
};

export type MorphismCell<TType extends MorphismType<unknown, unknown, string>> = Update<
    MorphismArgs<TType>
> &
    Reorder & {
        readonly kind: typeof CellKind.Morphism;
        readonly id: string;
        readonly type: TType;
        readonly name: string;
        duplicate(): MorphismCell<TType>;
    };

export type RichTextCell = Update<{ content: string }> &
    Reorder & {
        readonly kind: typeof CellKind.RichText;
        readonly id: string;
        readonly content: string;
    };

/**
 * One `ObjectCell` per object type of the logic, mapped over keys so that each
 * handle wraps the exact type value. The non-distributive `infer ... extends`
 * check selects object types without shattering each `ObType` union into its
 * variants (as a distributive conditional would).
 */
type LogicObjectCell<TLogic extends AnyModelLogic> = {
    [K in keyof TLogic["cellTypes"]]: TLogic["cellTypes"][K] extends infer T extends
        ObjectType<string>
        ? ObjectCell<T>
        : never;
}[keyof TLogic["cellTypes"]];

/** One `MorphismCell` per morphism type of the logic. */
type LogicMorphismCell<TLogic extends AnyModelLogic> = {
    [K in keyof TLogic["cellTypes"]]: TLogic["cellTypes"][K] extends infer T extends MorphismType<
        unknown,
        unknown,
        string
    >
        ? MorphismCell<T>
        : never;
}[keyof TLogic["cellTypes"]];

export type ModelLogic<Theory extends string, TCellTypes extends Record<string, CellType>> = {
    readonly theory: Theory;
    readonly cellTypes: TCellTypes;
};

type AnyModelLogic = ModelLogic<string, Record<string, CellType>>;

/** The object types of a logic, selected from `cellTypes` by their brand. */
type LogicObjectType<TLogic extends AnyModelLogic> = {
    [K in keyof TLogic["cellTypes"]]: TLogic["cellTypes"][K] extends infer T extends
        ObjectType<string>
        ? T
        : never;
}[keyof TLogic["cellTypes"]];

/** The morphism types of a logic, selected from `cellTypes` by their brand. */
type LogicMorphismType<TLogic extends AnyModelLogic> = {
    [K in keyof TLogic["cellTypes"]]: TLogic["cellTypes"][K] extends infer T extends MorphismType<
        unknown,
        unknown,
        string
    >
        ? T
        : never;
}[keyof TLogic["cellTypes"]];

/**
 * The union of cell handles that iterating over a notebook can yield,
 * distributed over the logic's exact object and morphism types so that
 * comparisons like `cell.type === Entity` narrow the handle.
 */
export type NotebookCell<TLogic extends AnyModelLogic> =
    | RichTextCell
    | LogicObjectCell<TLogic>
    | LogicMorphismCell<TLogic>;

export type ModelNotebook<TLogic extends AnyModelLogic, Handle = ModelDocument> = Update<{
    name: string;
}> & {
    /** Reactive read of the notebook's name. */
    readonly name: string;
    /**
     * The backend handle this notebook is bound to, e.g. an Automerge
     * `DocHandle`. With the plain in-memory backend it is the document itself.
     */
    readonly handle: Handle;
    /**
     * The underlying document. With a reactive backend (Solid, Automerge), this
     * is the reactive proxy; with the plain in-memory backend it is the raw
     * object.
     */
    readonly document: ModelDocument;
    /** Make a detached plain-JS snapshot of the underlying document. */
    dump(): ModelDocument;
    /** Handles for all cells, in notebook order. */
    cells(): Array<NotebookCell<TLogic>>;
    /**
     * Add a cell to the notebook. The kind of cell is selected by the first
     * argument:
     *
     * - {@link RichText} adds a rich-text cell; `args` is `{ content }`.
     * - An object type from the logic adds an object cell; `args` is `{ name }`.
     * - A morphism type from the logic adds a morphism cell; `args` is
     *   `{ name, dom, cod }`, with `dom`/`cod` constrained by the morphism type.
     */
    add(type: RichTextType, args: { content: string }): RichTextCell;
    add<TType extends LogicMorphismType<TLogic> = LogicMorphismType<TLogic>>(
        type: TType,
        args: MorphismArgs<TType>,
    ): MorphismCell<TType>;
    add<TType extends LogicObjectType<TLogic> = LogicObjectType<TLogic>>(
        type: TType,
        args: { name: string },
    ): ObjectCell<TType>;
};

export const objectType = <Name extends string>(content: string) =>
    ({ tag: "Basic", content, [typeKind]: "object" }) as ObjectType<Name>;

export const morphismType = <Dom, Cod, Name extends string>(morType?: MorType) =>
    ({
        ...(morType ?? { tag: "Hom", content: { tag: "Basic", content: "Object" } }),
        [typeKind]: "morphism",
    }) as MorphismType<Dom, Cod, Name>;

/**
 * Typed filter for cells with exactly the given object or morphism type.
 * TypeScript only narrows `===` comparisons on unit types, so a comparison
 * like `cell.type === Entity` cannot narrow a cell handle by itself; this
 * guard carries the narrowing instead.
 */
export function byType<TType extends ObjectType<string>>(
    type: TType,
): (cell: { readonly kind: symbol }) => cell is ObjectCell<TType>;
export function byType<TType extends MorphismType<unknown, unknown, string>>(
    type: TType,
): (cell: { readonly kind: symbol }) => cell is MorphismCell<TType>;
export function byType(type: CellType) {
    return (cell: { readonly kind: symbol }): boolean => (cell as { type?: unknown }).type === type;
}

/** Structural equality of stored type expressions (plain JSON-like values). */
const sameTypeValue = (a: unknown, b: unknown): boolean => {
    if (a === b) {
        return true;
    }
    if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) {
        return false;
    }
    const aRecord = a as Record<string, unknown>;
    const bRecord = b as Record<string, unknown>;
    const keys = Object.keys(aRecord);
    if (keys.length !== Object.keys(bRecord).length) {
        return false;
    }
    return keys.every((key) => sameTypeValue(aRecord[key], bRecord[key]));
};

function attachNotebook<TLogic extends AnyModelLogic, Handle>(
    backend: NotebookBackend<Handle>,
    handle: Handle,
    logic: TLogic,
): ModelNotebook<TLogic, Handle> {
    const doc = backend.viewDocument(handle);
    const change = (fn: (doc: ModelDocument) => void) => backend.changeDocument(handle, fn);
    const copy = backend.copyValue ? <T>(value: T) => backend.copyValue!(handle, value) : undefined;

    const readCellContent = <T>(cellId: string): T => {
        const cell = doc.notebook.cellContents[cellId];
        if (!cell) {
            throw new Error(`Notebook cell '${cellId}' not found (it may have been deleted).`);
        }
        return (cell as unknown as { content: T }).content;
    };

    const cloneJudgment = (judgment: ModelJudgment): ModelJudgment =>
        duplicateModelJudgment(copy ? copy(judgment) : judgment);

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

    const objectHandle = <TType extends LogicObjectType<TLogic>>(cellId: string, type: TType) =>
        ({
            kind: CellKind.Object,
            get id() {
                return readCellContent<{ id: string }>(cellId).id;
            },
            type,
            get name() {
                return readCellContent<{ name: string }>(cellId).name;
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
        }) as unknown as ObjectCell<TType>;

    const morphismHandle = <TType extends LogicMorphismType<TLogic>>(cellId: string, type: TType) =>
        ({
            kind: CellKind.Morphism,
            get id() {
                return readCellContent<{ id: string }>(cellId).id;
            },
            type,
            get name() {
                return readCellContent<{ name: string }>(cellId).name;
            },
            update(u: Partial<MorphismArgs<TType>>) {
                change((d) => {
                    Object.assign(
                        (d.notebook.cellContents[cellId] as { content: object }).content,
                        u,
                    );
                });
            },
            duplicate() {
                return morphismHandle(appendDuplicate(cellId), type);
            },
            ...reorderMethods(cellId),
        }) as unknown as MorphismCell<TType>;

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

    const findObjectType = (obType: ObType): LogicObjectType<TLogic> => {
        const match = Object.values(logic.cellTypes).find(
            (t) => t[typeKind] === "object" && sameTypeValue(t, obType),
        );
        if (!match) {
            throw new Error(
                `No object type in logic with theory "${logic.theory}" ` +
                    `matches ${JSON.stringify(obType)}.`,
            );
        }
        return match as LogicObjectType<TLogic>;
    };

    const findMorphismType = (morType: MorType): LogicMorphismType<TLogic> => {
        const match = Object.values(logic.cellTypes).find(
            (t) => t[typeKind] === "morphism" && sameTypeValue(t, morType),
        );
        if (!match) {
            throw new Error(
                `No morphism type in logic with theory "${logic.theory}" ` +
                    `matches ${JSON.stringify(morType)}.`,
            );
        }
        return match as LogicMorphismType<TLogic>;
    };

    return {
        get name() {
            return doc.name;
        },
        handle,
        get document() {
            return doc;
        },
        dump() {
            return copy ? copy(doc) : structuredClone(doc);
        },
        update(u: { name?: string }) {
            change((d) => {
                Object.assign(d, u);
            });
        },
        cells(): Array<NotebookCell<TLogic>> {
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
                        return objectHandle(cellId, findObjectType(judgment.obType));
                    case "morphism":
                        return morphismHandle(cellId, findMorphismType(judgment.morType));
                    default:
                        throw new Error(`Unsupported judgment tag: ${judgment.tag}`);
                }
            }) as Array<NotebookCell<TLogic>>;
        },
        add(type: unknown, args: { content?: string; name?: string }) {
            if (isRichTextType(type)) {
                const cell = newRichTextCell((args as { content: string }).content);
                change((d) => {
                    d.notebook.cellContents[cell.id] = cell;
                    d.notebook.cellOrder.push(cell.id);
                });
                return richTextHandle(cell.id);
            }
            if (isLogicMorphismType(type)) {
                const morType = type as LogicMorphismType<TLogic>;
                const judgment = newMorphismDecl(morType);
                judgment.name = (args as { name: string }).name;
                const formalCell = newFormalCell(judgment);
                change((d) => {
                    d.notebook.cellContents[formalCell.id] = formalCell;
                    d.notebook.cellOrder.push(formalCell.id);
                });
                return morphismHandle(formalCell.id, morType);
            }
            if (isLogicObjectType(type)) {
                const obType = type as LogicObjectType<TLogic>;
                const judgment = newObjectDecl(obType);
                judgment.name = (args as { name: string }).name;
                const formalCell = newFormalCell(judgment);
                change((d) => {
                    d.notebook.cellContents[formalCell.id] = formalCell;
                    d.notebook.cellOrder.push(formalCell.id);
                });
                return objectHandle(formalCell.id, obType);
            }
            throw new Error(
                `Unknown cell type passed to add(); expected RichText, an object type ` +
                    `or morphism type belonging to logic "${logic.theory}".`,
            );
        },
    } as unknown as ModelNotebook<TLogic, Handle>;

    function isLogicObjectType(value: unknown): boolean {
        return Object.values(logic.cellTypes).some((t) => t === value && t[typeKind] === "object");
    }

    function isLogicMorphismType(value: unknown): boolean {
        return Object.values(logic.cellTypes).some(
            (t) => t === value && t[typeKind] === "morphism",
        );
    }
}

/**
 * Entry points for typed notebooks over a fixed backend. Obtain one with
 * `createBinder`.
 */
export interface Binder<Handle> {
    /**
     * Build a typed notebook from fresh data. The document seed is constructed
     * internally from `data.name` and `logic.theory`, then handed to the
     * backend's `init`.
     */
    createNotebook<TLogic extends AnyModelLogic>(
        logic: TLogic,
        data: { name: string },
    ): ModelNotebook<TLogic, Handle>;
    /**
     * Build a typed notebook around an existing plain document by initializing
     * backend storage from it. Throws if the document's theory does not match
     * the logic's theory.
     */
    loadNotebook<TLogic extends AnyModelLogic>(
        logic: TLogic,
        document: ModelDocument,
    ): ModelNotebook<TLogic, Handle>;
    /**
     * Build a typed notebook around an existing backend handle, e.g. an
     * Automerge `DocHandle` found in a repo. No backend storage is created.
     */
    loadNotebookFromHandle<TLogic extends AnyModelLogic>(
        logic: TLogic,
        handle: Handle,
    ): ModelNotebook<TLogic, Handle>;
}

/** Bind a backend once, yielding `createNotebook`/`loadNotebook`/`loadNotebookFromHandle` entry points. */
export function createBinder<Handle>(backend: NotebookBackend<Handle>): Binder<Handle> {
    return {
        createNotebook(logic, data) {
            const seed = newModelDocument({ theory: logic.theory });
            seed.name = data.name;
            return this.loadNotebook(logic, seed);
        },
        loadNotebook(logic, document) {
            if (document.theory !== logic.theory) {
                throw new Error(
                    `Cannot load document with theory "${document.theory}" ` +
                        `using a logic with theory "${logic.theory}".`,
                );
            }
            return attachNotebook(backend, backend.createHandle(document), logic);
        },
        loadNotebookFromHandle(logic, handle) {
            return attachNotebook(backend, handle, logic);
        },
    };
}

/** A ready-made binder over the plain in-memory backend. */
export const binder: Binder<ModelDocument> = createBinder(plainBackend);
