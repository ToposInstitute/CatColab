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
 * produced by `init` and passed back into the other methods.
 */
export interface NotebookBackend<Handle> {
    /** Initialize a backend handle from an initial document. */
    init(initialDoc: ModelDocument): Handle;
    /** Read view of the document for a handle (reactive where applicable). */
    view(handle: Handle): ModelDocument;
    /** Apply a mutation by mutating a draft document. */
    change(handle: Handle, fn: (doc: ModelDocument) => void): void;
    /** Make a detached plain-JS copy of a backend-owned value before cloning it. */
    copy?<T>(handle: Handle, value: T): T;
}

/** A plain in-memory backend whose handle is the document itself. */
export const plainBackend: NotebookBackend<ModelDocument> = {
    init: (initialDoc) => initialDoc,
    view: (handle) => handle,
    change: (handle, fn) => fn(handle),
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

export type ObjectType<Name extends string> = ObType & { readonly objectTypeName?: Name };
export type MorphismType<Dom, Cod, Name extends string> = MorType & {
    readonly morphismTypeName?: Name;
    readonly dom?: Dom;
    readonly cod?: Cod;
};

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

export type ObjectCell<TType extends ObjectType<string>> = Update<{ name: string }> & {
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
> & {
    readonly kind: typeof CellKind.Morphism;
    readonly id: string;
    readonly type: TType;
    readonly name: string;
    duplicate(): MorphismCell<TType>;
};

export type RichTextCell = Update<{ content: string }> & {
    readonly kind: typeof CellKind.RichText;
    readonly id: string;
    readonly content: string;
};

export type ModelLogic<
    Theory extends string,
    TObjectTypes extends Record<string, ObjectType<string>>,
    TMorphismTypes extends Record<string, MorphismType<unknown, unknown, string>>,
> = {
    readonly theory: Theory;
    readonly objectTypes: TObjectTypes;
    readonly morphismTypes: TMorphismTypes;
};

type AnyModelLogic = ModelLogic<
    string,
    Record<string, ObjectType<string>>,
    Record<string, MorphismType<unknown, unknown, string>>
>;

type LogicObjectType<TLogic extends AnyModelLogic> =
    TLogic extends ModelLogic<
        string,
        infer TObjectTypes,
        Record<string, MorphismType<unknown, unknown, string>>
    >
        ? TObjectTypes[keyof TObjectTypes]
        : never;

type LogicMorphismType<TLogic extends AnyModelLogic> =
    TLogic extends ModelLogic<string, Record<string, ObjectType<string>>, infer TMorphismTypes>
        ? TMorphismTypes[keyof TMorphismTypes]
        : never;

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
    richText(args: { content: string }): RichTextCell;
    object<TType extends LogicObjectType<TLogic> = LogicObjectType<TLogic>>(
        type: TType,
        args: { name: string },
    ): ObjectCell<TType>;
    morphism<TType extends LogicMorphismType<TLogic> = LogicMorphismType<TLogic>>(
        type: TType,
        args: MorphismArgs<TType>,
    ): MorphismCell<TType>;
};

export const objectType = <Name extends string>(content: string) =>
    ({ tag: "Basic", content }) as ObjectType<Name>;

export const morphismType = <Dom, Cod, Name extends string>() =>
    ({ tag: "Hom", content: { tag: "Basic", content: "Object" } }) as MorphismType<Dom, Cod, Name>;

function attachNotebook<TLogic extends AnyModelLogic, Handle>(
    backend: NotebookBackend<Handle>,
    handle: Handle,
    _logic: TLogic,
): ModelNotebook<TLogic, Handle> {
    const doc = backend.view(handle);
    const change = (fn: (doc: ModelDocument) => void) => backend.change(handle, fn);
    const copy = backend.copy ? <T>(value: T) => backend.copy!(handle, value) : undefined;

    const readCellContent = <T>(cellId: string): T =>
        (doc.notebook.cellContents[cellId] as unknown as { content: T }).content;

    const cloneJudgment = (judgment: ModelJudgment): ModelJudgment =>
        duplicateModelJudgment(copy ? copy(judgment) : judgment);

    const duplicateFormalCell = (cellId: string): Cell<ModelJudgment> => {
        const cell = doc.notebook.cellContents[cellId];
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
        }) as unknown as MorphismCell<TType>;

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
        richText({ content }: { content: string }) {
            const cell = newRichTextCell(content);
            change((d) => {
                d.notebook.cellContents[cell.id] = cell;
                d.notebook.cellOrder.push(cell.id);
            });
            const cellId = cell.id;
            return {
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
            } as unknown as RichTextCell;
        },
        object<TType extends LogicObjectType<TLogic> = LogicObjectType<TLogic>>(
            type: TType,
            objectArgs: { name: string },
        ) {
            const judgment = newObjectDecl(type);
            judgment.name = objectArgs.name;
            const formalCell = newFormalCell(judgment);
            change((d) => {
                d.notebook.cellContents[formalCell.id] = formalCell;
                d.notebook.cellOrder.push(formalCell.id);
            });
            const cellId = formalCell.id;
            return objectHandle(cellId, type);
        },
        morphism<TType extends LogicMorphismType<TLogic> = LogicMorphismType<TLogic>>(
            type: TType,
            morphismArgs: MorphismArgs<TType>,
        ) {
            const judgment = newMorphismDecl(type);
            judgment.name = morphismArgs.name;
            const formalCell = newFormalCell(judgment);
            change((d) => {
                d.notebook.cellContents[formalCell.id] = formalCell;
                d.notebook.cellOrder.push(formalCell.id);
            });
            const cellId = formalCell.id;
            return morphismHandle(cellId, type);
        },
    } as unknown as ModelNotebook<TLogic, Handle>;
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
    create<TLogic extends AnyModelLogic>(
        logic: TLogic,
        data: { name: string },
    ): ModelNotebook<TLogic, Handle>;
    /**
     * Build a typed notebook around an existing plain document by initializing
     * backend storage from it. Throws if the document's theory does not match
     * the logic's theory.
     */
    load<TLogic extends AnyModelLogic>(
        logic: TLogic,
        document: ModelDocument,
    ): ModelNotebook<TLogic, Handle>;
    /**
     * Build a typed notebook around an existing backend handle, e.g. an
     * Automerge `DocHandle` found in a repo. No backend storage is created.
     */
    attach<TLogic extends AnyModelLogic>(
        logic: TLogic,
        handle: Handle,
    ): ModelNotebook<TLogic, Handle>;
}

/** Bind a backend once, yielding `create`/`load`/`attach` entry points. */
export function createBinder<Handle>(backend: NotebookBackend<Handle>): Binder<Handle> {
    return {
        create(logic, data) {
            const seed = newModelDocument({ theory: logic.theory });
            seed.name = data.name;
            return this.load(logic, seed);
        },
        load(logic, document) {
            if (document.theory !== logic.theory) {
                throw new Error(
                    `Cannot load document with theory "${document.theory}" ` +
                        `using a logic with theory "${logic.theory}".`,
                );
            }
            return attachNotebook(backend, backend.init(document), logic);
        },
        attach(logic, handle) {
            return attachNotebook(backend, handle, logic);
        },
    };
}

/** A ready-made binder over the plain in-memory backend. */
export const binder: Binder<ModelDocument> = createBinder(plainBackend);
