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
 * A notebook backend instance abstracts the read/write surface that
 * `ModelNotebook` operates over. Reads come from `doc` (which may be a reactive
 * proxy, e.g. a Solid store). Writes are expressed as draft mutations of the
 * document, mirroring Solid's `produce` and Automerge's `handle.change`.
 */
export interface NotebookBackendInstance {
    /** Read view of the document. Will be reactive if used with Solid correctly. */
    readonly doc: ModelDocument;
    /** Apply a mutation by mutating a draft document. */
    change(fn: (doc: ModelDocument) => void): void;
    /** Make a detached plain-JS copy of a backend-owned value before cloning it. */
    copy?<T>(value: T): T;
}

/**
 * Factory that constructs a `NotebookBackendInstance` from an initial document.
 * `ModelNotebook.create` builds the seed and hands it to the factory.
 */
export type NotebookBackend = (intialDoc: ModelDocument) => NotebookBackendInstance;

/** A plain in-memory backend that mutates the document in place. */
export const plainBackend: NotebookBackend = (initial) => ({
    doc: initial,
    change: (fn) => fn(initial),
});

export type ObjectType<Name extends string> = ObType & { readonly objectTypeName?: Name };
export type MorphismType<Endpoint, Name extends string> = MorType & {
    readonly morphismTypeName?: Name;
    readonly endpoint?: Endpoint;
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
    readonly id: string;
    readonly type: TType;
    readonly name: string;
    duplicate(): ObjectCell<TType>;
};

type EndpointOf<TType> = TType extends MorphismType<infer Endpoint, string> ? Endpoint : never;

type MorphismArgs<TType extends MorphismType<unknown, string>> = {
    name: string;
    dom: EndpointOf<TType>;
    cod: EndpointOf<TType>;
};

export type MorphismCell<TType extends MorphismType<unknown, string>> = Update<
    MorphismArgs<TType>
> & {
    readonly id: string;
    readonly type: TType;
    readonly name: string;
    duplicate(): MorphismCell<TType>;
};

export type RichTextCell = Update<{ content: string }> & {
    readonly id: string;
    readonly content: string;
};

export type ModelLogic<
    Theory extends string,
    TObjectTypes extends Record<string, ObjectType<string>>,
    TMorphismTypes extends Record<string, MorphismType<unknown, string>>,
> = {
    readonly theory: Theory;
    readonly objectTypes: TObjectTypes;
    readonly morphismTypes: TMorphismTypes;
};

type AnyModelLogic = ModelLogic<
    string,
    Record<string, ObjectType<string>>,
    Record<string, MorphismType<unknown, string>>
>;

type LogicObjectType<TLogic extends AnyModelLogic> =
    TLogic extends ModelLogic<
        string,
        infer TObjectTypes,
        Record<string, MorphismType<unknown, string>>
    >
        ? TObjectTypes[keyof TObjectTypes]
        : never;

type LogicMorphismType<TLogic extends AnyModelLogic> =
    TLogic extends ModelLogic<string, Record<string, ObjectType<string>>, infer TMorphismTypes>
        ? TMorphismTypes[keyof TMorphismTypes]
        : never;

export type ModelNotebook<TLogic extends AnyModelLogic> = Update<{ name: string }> & {
    /** Reactive read of the notebook's name. */
    readonly name: string;
    /**
     * The underlying document. With a reactive backend (Solid, Automerge), this
     * is the reactive proxy; with the plain in-memory backend it is the raw
     * object.
     */
    readonly document: ModelDocument;
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

export const morphismType = <Endpoint, Name extends string>() =>
    ({ tag: "Hom", content: { tag: "Basic", content: "Object" } }) as MorphismType<Endpoint, Name>;

function attachNotebook<TLogic extends AnyModelLogic>(
    backend: NotebookBackendInstance,
    _logic: TLogic,
): ModelNotebook<TLogic> {
    const readCellContent = <T>(cellId: string): T =>
        (backend.doc.notebook.cellContents[cellId] as unknown as { content: T }).content;

    const cloneJudgment = (judgment: ModelJudgment): ModelJudgment =>
        duplicateModelJudgment(backend.copy ? backend.copy(judgment) : judgment);

    const duplicateFormalCell = (cellId: string): Cell<ModelJudgment> => {
        const cell = backend.doc.notebook.cellContents[cellId];
        return duplicateCell(cell, cloneJudgment);
    };

    const appendDuplicate = (cellId: string): string => {
        const duplicatedCell = duplicateFormalCell(cellId);
        backend.change((d) => {
            d.notebook.cellContents[duplicatedCell.id] = duplicatedCell;
            d.notebook.cellOrder.push(duplicatedCell.id);
        });
        return duplicatedCell.id;
    };

    const objectHandle = <TType extends LogicObjectType<TLogic>>(cellId: string, type: TType) =>
        ({
            get id() {
                return readCellContent<{ id: string }>(cellId).id;
            },
            type,
            get name() {
                return readCellContent<{ name: string }>(cellId).name;
            },
            update(u: { name?: string }) {
                backend.change((d) => {
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
            get id() {
                return readCellContent<{ id: string }>(cellId).id;
            },
            type,
            get name() {
                return readCellContent<{ name: string }>(cellId).name;
            },
            update(u: Partial<MorphismArgs<TType>>) {
                backend.change((d) => {
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
            return backend.doc.name;
        },
        get document() {
            return backend.doc;
        },
        update(u: { name?: string }) {
            backend.change((d) => {
                Object.assign(d, u);
            });
        },
        richText({ content }: { content: string }) {
            const cell = newRichTextCell(content);
            backend.change((d) => {
                d.notebook.cellContents[cell.id] = cell;
                d.notebook.cellOrder.push(cell.id);
            });
            const cellId = cell.id;
            return {
                id: cellId,
                get content() {
                    return readCellContent<string>(cellId);
                },
                update(u: { content?: string }) {
                    backend.change((d) => {
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
            backend.change((d) => {
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
            backend.change((d) => {
                d.notebook.cellContents[formalCell.id] = formalCell;
                d.notebook.cellOrder.push(formalCell.id);
            });
            const cellId = formalCell.id;
            return morphismHandle(cellId, type);
        },
    } as unknown as ModelNotebook<TLogic>;
}

export const ModelNotebook = {
    /**
     * Build a typed notebook. The document seed is constructed internally
     * from `data.name` and `logic.theory`. An optional backend factory in
     * `options` controls how the seed is wrapped (in-memory by default;
     * Solid- or Automerge-backed via the helpers in `./backends/`).
     */
    create<TLogic extends AnyModelLogic>(
        logic: TLogic,
        data: { name: string },
        options?: { backend?: NotebookBackend },
    ): ModelNotebook<TLogic> {
        const seed = newModelDocument({ theory: logic.theory });
        seed.name = data.name;
        const backend = options?.backend ? options.backend(seed) : plainBackend(seed);
        return attachNotebook(backend, logic);
    },
};
