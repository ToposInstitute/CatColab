import { v7 } from "uuid";

import type { Modality, MorType, Ob, ObType } from "catcolab-document-types";
import type { Cell, ModelJudgment } from "catcolab-document-types";
import {
    type DblModel,
    DblModelMap,
    type DblTheory,
    elaborateModel,
    type InvalidDblModel,
    type ModelNotebook as WasmModelNotebook,
} from "catlog-wasm";
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
 * A document store abstracts the storage that notebooks operate over. A
 * store is a stateless object working on handles of its own choosing: a
 * plain document, a Solid store, an Automerge `DocHandle`, etc. Handles are
 * produced by `createHandle` and passed back into the other methods.
 */
export interface DocumentStore<Handle> {
    /** Initialize a store handle from an initial document. */
    createHandle(initialDoc: ModelDocument): Handle;
    /** Read view of the document for a handle (reactive where applicable). */
    viewDocument(handle: Handle): ModelDocument;
    /** Apply a mutation by mutating a draft document. */
    changeDocument(handle: Handle, fn: (doc: ModelDocument) => void): void;
    /** Make a detached plain-JS copy of a store-owned value before cloning it. */
    copyValue?<T>(handle: Handle, value: T): T;
}

/** A plain in-memory store whose handle is the document itself. */
export const plainStore: DocumentStore<ModelDocument> = {
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

const richTextTypeBrand: unique symbol = Symbol("richTextType");

/**
 * The sentinel cell-type used to add rich-text cells to a notebook. Pass it
 * as the first argument to {@link Notebook.add}; the second argument is
 * `{ content: string }`. Unlike object and morphism types, `RichText` is not
 * an `ObType`/`MorType`; it lives at the top level.
 */
export type RichTextType = { readonly [richTextTypeBrand]: true };

/** The singleton {@link RichTextType} value. */
export const RichText: RichTextType = { [richTextTypeBrand]: true };

const isRichTextType = (value: unknown): value is RichTextType =>
    typeof value === "object" &&
    value !== null &&
    (value as RichTextType)[richTextTypeBrand] === true;

/** Methods shared by all cell handles for editing a field. */
type Update<T> = {
    /** Update one or more of the cell's fields. */
    update(args: Partial<T>): void;
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

/**
 * An object-cell handle. The cell is parametrized by its `ObType`: two object
 * types with different `ObType` values (e.g. a Petri-net `Place`, which is
 * `{ tag: "Basic", content: "Object" }`, and a schema `Entity`, which is
 * `{ tag: "Basic", content: "Entity" }`) yield distinct, non-interchangeable
 * cell handles. The widest instantiation, `ObjectCell<ObType>` (or the default
 * `ObjectCell`), is the untyped form a generic notebook yields.
 */
export type ObjectCell<O extends ObType = ObType> = Update<{ name: string }> &
    Reorder & {
        readonly kind: typeof CellKind.Object;
        readonly id: string;
        readonly type: O;
        readonly name: string;
        duplicate(): ObjectCell<O>;
    };

/** Modalities whose endpoints are lists of objects rather than a single one. */
type ListModality = "List" | "SymmetricList" | "CocartesianList" | "CartesianList" | "AdditiveList";

/**
 * The endpoint type of a morphism cell, derived from the morphism's `MorType`:
 *
 * - a `Hom` over a list modality (e.g. a Petri-net transition's
 *   `Hom(ModeApp(SymmetricList, Object))`) has array-valued endpoints of the
 *   inner object type;
 * - a plain `Hom` over an object type (e.g. a schema `Mapping`,
 *   `Hom(Entity)`) has a single object cell of that type;
 * - any other morphism type (e.g. a `Basic` morphism such as a schema `Attr`)
 *   does not record its endpoint object type, so its endpoints stay untyped: a
 *   single object cell or a list of them.
 *
 * For the precise cases the `MorType` must be a literal (declare it with
 * `as const`) so its structure survives inference.
 */
export type EndpointOf<M extends MorType> = [M] extends [
    {
        tag: "Hom";
        content: {
            tag: "ModeApp";
            content: { modality: infer Mod; obType: infer O extends ObType };
        };
    },
]
    ? Mod extends ListModality
        ? ObjectCell<O>[]
        : ObjectCell<O>
    : [M] extends [{ tag: "Hom"; content: infer O extends ObType }]
      ? ObjectCell<O>
      : ObjectCell<ObType> | ObjectCell<ObType>[];

declare const domBrand: unique symbol;
declare const codBrand: unique symbol;

/**
 * Phantom carrier of a morphism's endpoint object types. A `Hom` morphism reads
 * its endpoints from its `MorType` structure, but a `Basic` morphism (e.g. a
 * schema `Attr`) records nothing about its source/target in the literal, so it
 * must declare them with {@link basicMorphism}. These properties exist only in the
 * type system; they are never written at runtime.
 */
export type Endpoints<D extends ObType, C extends ObType> = {
    readonly [domBrand]: D;
    readonly [codBrand]: C;
};

/**
 * Declare a `Basic` morphism type with explicit endpoint object types. The
 * first argument is the morphism's name (its `content`); the returned value is
 * the `Basic` `MorType` at runtime, with its source/target object types carried
 * only in the static type. A `Basic` morphism records no endpoints in its
 * literal, so declaring one in a shape *requires* this helper; a bare `Basic`
 * literal is a compile error (see {@link defineShape}).
 */
export function basicMorphism<
    const Name extends string,
    const D extends ObType,
    const C extends ObType,
>(content: Name, _dom: D, _cod: C): { tag: "Basic"; content: Name } & Endpoints<D, C> {
    return { tag: "Basic", content } as { tag: "Basic"; content: Name } & Endpoints<D, C>;
}

/**
 * The compile error surfaced when a `Basic` morphism is declared without
 * endpoints. Its sole key spells out the fix, so the diagnostic names it.
 */
export type EndpointsRequired<M extends MorType> = {
    "This Basic morphism must be declared with basicMorphism(name, dom, cod)": M;
};

/**
 * A morphism type carries typed endpoints when it is a `Hom` (endpoints read
 * from its structure) or has been declared with {@link basicMorphism}. Anything else
 * — notably a bare `Basic` morphism — does not.
 */
type HasTypedEndpoints<M extends MorType> = [M] extends [Endpoints<ObType, ObType>]
    ? true
    : [M] extends [{ tag: "Hom"; content: ObType }]
      ? true
      : false;

/**
 * The domain endpoint type of a morphism cell. A {@link basicMorphism}-branded
 * morphism uses its declared domain; a `Hom` derives it via {@link EndpointOf};
 * a bare `Basic` morphism is a type error, and any wider/unknown morphism type
 * falls back to the untyped endpoint union.
 */
export type DomOf<M extends MorType> = [M] extends [Endpoints<infer D extends ObType, ObType>]
    ? ObjectCell<D>
    : [M] extends [{ tag: "Hom"; content: ObType }]
      ? EndpointOf<M>
      : [M] extends [{ tag: "Basic"; content: string }]
        ? EndpointsRequired<M>
        : EndpointOf<M>;

/** The codomain endpoint type of a morphism cell; see {@link DomOf}. */
export type CodOf<M extends MorType> = [M] extends [Endpoints<ObType, infer C extends ObType>]
    ? ObjectCell<C>
    : [M] extends [{ tag: "Hom"; content: ObType }]
      ? EndpointOf<M>
      : [M] extends [{ tag: "Basic"; content: string }]
        ? EndpointsRequired<M>
        : EndpointOf<M>;

/**
 * A morphism-cell handle, parametrized by its `MorType`. The domain and
 * codomain types are derived from the morphism type by {@link EndpointOf}, so
 * wiring an endpoint of the wrong object type, or a single object where a list
 * is required, is a compile error. The widest instantiation,
 * `MorphismCell<MorType>` (or the default `MorphismCell`), is the untyped form
 * a generic notebook yields; its endpoints are then the union of a single
 * object cell or a list, so reading a single field like `cell.dom.name` is a
 * type error.
 */
export type MorphismCell<M extends MorType = MorType> = Update<{
    name: string;
    dom: DomOf<M>;
    cod: CodOf<M>;
}> &
    Reorder & {
        readonly kind: typeof CellKind.Morphism;
        readonly id: string;
        readonly type: M;
        readonly name: string;
        readonly dom: DomOf<M>;
        readonly cod: CodOf<M>;
        duplicate(): MorphismCell<M>;
    };

export type RichTextCell = Update<{ content: string }> &
    Reorder & {
        readonly kind: typeof CellKind.RichText;
        readonly id: string;
        readonly content: string;
    };

/**
 * The union of object-cell handles a shape declares, one member per object
 * type keyed in the shape. Distributing over the shape's declared keys (rather
 * than over the internal {@link ObType} union) keeps each declared type a
 * distinct, discriminable member; for the default {@link AnyShape} it collapses
 * to the widest {@link ObjectCell}.
 */
type ObjectCellsOf<TShape extends AnyShape> = TShape extends AnyShape
    ? {
          [K in keyof ShapeObjectRecord<TShape>]: ObjectCell<ShapeObjectRecord<TShape>[K] & ObType>;
      }[keyof ShapeObjectRecord<TShape>]
    : never;

/** The union of morphism-cell handles a shape declares; see {@link ObjectCellsOf}. */
type MorphismCellsOf<TShape extends AnyShape> = TShape extends AnyShape
    ? {
          [K in keyof ShapeMorphismRecord<TShape>]: MorphismCell<
              ShapeMorphismRecord<TShape>[K] & MorType
          >;
      }[keyof ShapeMorphismRecord<TShape>]
    : never;

/**
 * The union of cell handles that iterating a notebook with {@link
 * Notebook.cells} yields, parametrized by the notebook's {@link Shape}. Each of
 * the shape's object and morphism types contributes its own precise handle
 * (e.g. a Petri-net `NotebookCell<typeof PetriNet>` is `RichTextCell |
 * PlaceCell | TransitionCell`), so a single-type endpoint like `cell.dom.name`
 * type-checks after discriminating on `cell.kind`.
 *
 * The default {@link AnyShape} instantiation (the bare `NotebookCell`) widens
 * the object and morphism members to `ObjectCell`/`MorphismCell`; recover
 * precise handles from it by filtering with {@link byObjectType} or {@link
 * byMorphismType}.
 */
export type NotebookCell<TShape extends AnyShape = AnyShape> =
    | RichTextCell
    | ObjectCellsOf<TShape>
    | MorphismCellsOf<TShape>;

/**
 * A pushforward migration from this shape to another. Mirrors the core: it
 * transports an elaborated model along a theory morphism into the target
 * theory. The target's core theory is supplied by the caller of `migrate`.
 */
export type ModelMigration = {
    /** Identifier of the document theory migrated into. */
    readonly target: string;
    /** Transport an elaborated model along the morphism into `targetTheory`. */
    readonly migrate: (model: DblModel, targetTheory: DblTheory) => DblModel;
};

/**
 * A shape describes the object and morphism types a notebook is built from.
 *
 * - With a `theory` (and usually a `coreTheory`) it is a full, *creatable*
 *   shape: a notebook can be created, loaded, validated and migrated from it.
 * - Without a `theory` it is a *sub-shape*: a structural contract a component
 *   declares over a subset of cell types. It can type props, filter cells and
 *   edit an existing notebook, but cannot originate a document.
 *
 * Object and morphism types are plain `ObType`/`MorType` literals; declare
 * them with `as const` so their structure (and a morphism's endpoint object
 * type) survives type inference.
 */
export type Shape = {
    /** Identifier of the document theory; omit for a sub-shape contract. */
    readonly theory?: string;
    /**
     * The double theory in the core that notebooks of this shape elaborate
     * into, e.g. `new ThCategory().theory()`. Optional: a sub-shape has none,
     * and {@link Notebook.validate} can also be passed one explicitly.
     */
    readonly coreTheory?: DblTheory;
    /** Object types, keyed by name. Omit for a shape that declares no objects. */
    readonly objects?: Record<string, ObType>;
    /** Morphism types, keyed by name. Omit for a shape that declares no morphisms. */
    readonly morphisms?: Record<string, MorType>;
    /** Theories this shape includes into (trivial migration target). */
    readonly inclusions?: readonly string[];
    /** Non-trivial migrations to other shapes, keyed by target theory. */
    readonly migrations?: readonly ModelMigration[];
};

/** Any shape, used as the default and as a generic constraint. */
type AnyShape = Shape;

/**
 * A shape's object record, defaulting an omitted `objects` to the empty record
 * so indexing and `keyof` stay well-defined for shapes that declare none.
 */
type ShapeObjectRecord<TShape extends AnyShape> = [NonNullable<TShape["objects"]>] extends [never]
    ? Record<never, ObType>
    : NonNullable<TShape["objects"]>;
/** A shape's morphism record; see {@link ShapeObjectRecord}. */
type ShapeMorphismRecord<TShape extends AnyShape> = [NonNullable<TShape["morphisms"]>] extends [
    never,
]
    ? Record<never, MorType>
    : NonNullable<TShape["morphisms"]>;

/** A shape that can originate a document: it carries a document theory. */
type CreatableShape = Shape & { readonly theory: string };

/**
 * The union of a shape's object types. Deliberately *not* distributive over a
 * union of shapes: indexing the union of object records by their shared keys
 * yields only the object types every member declares, so {@link Notebook.add}
 * over a union shape accepts an object only when it is safe for whichever member
 * the notebook turns out to be. Narrow first with {@link Notebook.supports}.
 */
type ShapeObjects<TShape extends AnyShape> =
    ShapeObjectRecord<TShape>[keyof ShapeObjectRecord<TShape>] & ObType;
/** The union of a shape's morphism types; see {@link ShapeObjects} for the union-shape semantics. */
type ShapeMorphisms<TShape extends AnyShape> =
    ShapeMorphismRecord<TShape>[keyof ShapeMorphismRecord<TShape>] & MorType;

/**
 * Every object and morphism type a shape declares. Unlike {@link ShapeObjects}
 * and {@link ShapeMorphisms}, this *distributes* over a union of shapes, so a
 * union shape's declared types are the union of all members' declared types.
 * Carried by the phantom {@link Notebook} member that drives shape assignability
 * (see there): a notebook is assignable to another only when its declared types
 * relate to the target's, so a notebook whose morphisms are foreign to a union
 * shape (e.g. a `SimpleOlog` against a union of list shapes) is rejected, while
 * one declaring a subset (e.g. a `PetriNet`) is accepted.
 */
type DeclaredTypes<TShape extends AnyShape> = TShape extends AnyShape
    ?
          | (ShapeObjectRecord<TShape>[keyof ShapeObjectRecord<TShape>] & ObType)
          | (ShapeMorphismRecord<TShape>[keyof ShapeMorphismRecord<TShape>] & MorType)
    : never;

/**
 * The morphism types a shape declares, distributing over a union of shapes like
 * {@link DeclaredTypes} (and unlike {@link ShapeMorphisms}, which collapses to
 * the morphisms shared by every member): the union of every member's morphism
 * types, or `never` for a shape that declares none.
 */
type DeclaredMorphisms<TShape extends AnyShape> = TShape extends AnyShape
    ? ShapeMorphismRecord<TShape>[keyof ShapeMorphismRecord<TShape>] & MorType
    : never;

/** Whether a shape declares at least one morphism type. */
type DeclaresMorphism<TShape extends AnyShape> = [DeclaredMorphisms<TShape>] extends [never]
    ? false
    : true;

/** The object types a shape declares, distributing over a union of shapes; the
 * object-side dual of {@link DeclaredMorphisms}. */
type DeclaredObjects<TShape extends AnyShape> = TShape extends AnyShape
    ? ShapeObjectRecord<TShape>[keyof ShapeObjectRecord<TShape>] & ObType
    : never;

/** Whether a shape declares at least one object type. */
type DeclaresObject<TShape extends AnyShape> = [DeclaredObjects<TShape>] extends [never]
    ? false
    : true;

/**
 * The {@link Notebook.add} capability gained once a notebook is known to
 * support the cell type `T`. {@link Notebook.supports} narrows a notebook to its
 * own type intersected with this, which adds an `add` overload accepting exactly
 * `T` — so the guarded `add` type-checks even when `T` is not declared by every
 * member of a union shape. An intersection is always a subtype of the original
 * notebook, so this narrowing is immune to the method-bivariance that makes
 * union- and member-shape notebooks otherwise mutually assignable.
 *
 * A `Basic` object type and a `Basic` morphism type are structurally identical
 * (`{ tag: "Basic"; content: Ustr }` is a member of both {@link ObType} and
 * {@link MorType}), so `T extends MorType` cannot tell them apart. The morphism
 * capability is therefore selected by {@link HasTypedEndpoints} — the same test
 * that distinguishes a real morphism (a `Hom`, or a {@link basicMorphism}-branded
 * `Basic`) from a bare `Basic`, which is treated as an object.
 */
type AddCapability<T extends ObType | MorType> =
    HasTypedEndpoints<T & MorType> extends true
        ? {
              add(
                  type: T,
                  args: { name: string; dom: DomOf<T & MorType>; cod: CodOf<T & MorType> },
              ): MorphismCell<T & MorType>;
          }
        : T extends ObType
          ? { add(type: T, args: { name: string }): ObjectCell<T> }
          : object;

/**
 * Turn a union into the intersection of its members. Used to combine the
 * per-type {@link AddCapability}s of every type a shape declares into a single
 * capability, so {@link Notebook.supportsShape} can grant them all at once.
 */
type UnionToIntersection<U> = (U extends unknown ? (k: U) => void : never) extends (
    k: infer I,
) => void
    ? I
    : never;

/**
 * The combined {@link Notebook.add} capability gained once a notebook is known
 * to support *every* object and morphism type a sub-shape declares: the
 * intersection of {@link AddCapability} over the shape's {@link DeclaredTypes}.
 * Narrowing a notebook to its own type intersected with this lets a guarded
 * block add any of the sub-shape's types without narrowing each individually.
 */
type ShapeAddCapability<S extends AnyShape> = UnionToIntersection<
    DeclaredTypes<S> extends infer T
        ? T extends ObType | MorType
            ? AddCapability<T>
            : never
        : never
>;

/** An elaborated model together with its validation status. */
export type ModelValidationResult =
    /** Successfully elaborated and validated. */
    | { tag: "Valid"; model: DblModel }
    /** Elaborated, but failing one or more validation checks. */
    | { tag: "Invalid"; model: DblModel; errors: InvalidDblModel[] }
    /** Failed to even elaborate into a model. */
    | { tag: "Illformed"; model: null; error: string };

/**
 * Define a shape from a compact declaration of object and morphism types.
 * Object and morphism types are `ObType`/`MorType` literals (declare them with
 * `as const`). A `Hom` morphism's endpoint object type and arity are read from
 * its `MorType` structure; a `Basic` morphism records no endpoints in its
 * literal, so it must declare them with {@link basicMorphism} — a bare `Basic`
 * morphism is a compile error. `theory`/`coreTheory` are optional: include them
 * for a creatable shape, omit them for a sub-shape contract.
 */
export function defineShape<const TSpec extends Shape>(
    spec: TSpec & {
        morphisms?: {
            [K in keyof ShapeMorphismRecord<TSpec>]: ValidatedMorphism<
                ShapeMorphismRecord<TSpec>[K] & MorType
            >;
        };
    },
): TSpec {
    return spec;
}

/** A morphism declaration is kept as-is when it has typed endpoints, otherwise
 * it is replaced by the {@link EndpointsRequired} error type. */
type ValidatedMorphism<M extends MorType> =
    HasTypedEndpoints<M> extends true ? M : EndpointsRequired<M>;

/**
 * Typed filter for cells of exactly the given object type. TypeScript only
 * narrows `===` comparisons on unit types, so a comparison like `cell.type ===
 * Place` cannot narrow a cell handle by itself; this guard carries the
 * narrowing instead. Matching is structural, so a cell whose stored `ObType`
 * equals `type` is selected regardless of which shape produced `type`.
 */
export function byObjectType<O extends ObType>(
    type: O,
): (cell: { readonly kind: symbol }) => cell is ObjectCell<O> {
    return (cell): cell is ObjectCell<O> =>
        (cell as { kind: symbol }).kind === CellKind.Object &&
        sameTypeValue((cell as { type?: unknown }).type, type);
}

/** Typed filter for cells of exactly the given morphism type. */
export function byMorphismType<M extends MorType>(
    type: M,
): (cell: { readonly kind: symbol }) => cell is MorphismCell<M> {
    return (cell): cell is MorphismCell<M> =>
        (cell as { kind: symbol }).kind === CellKind.Morphism &&
        sameTypeValue((cell as { type?: unknown }).type, type);
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

const LIST_MODALITIES: ReadonlySet<Modality> = new Set<Modality>([
    "List",
    "SymmetricList",
    "CocartesianList",
    "CartesianList",
    "AdditiveList",
]);

/**
 * The list modality of a morphism type's endpoints, read from the modality in
 * its `Hom` content, or `null` when the endpoints are single objects. This is
 * the runtime counterpart of the list branch of {@link EndpointOf}.
 */
const morTypeListModality = (morType: MorType): Modality | null => {
    if (morType.tag !== "Hom") {
        return null;
    }
    const inner = morType.content;
    if (inner.tag === "ModeApp" && LIST_MODALITIES.has(inner.content.modality)) {
        return inner.content.modality;
    }
    return null;
};

/** Encode an object-cell endpoint reference as a model object. */
const encodeObjectRef = (cell: { readonly id: string }): Ob => ({
    tag: "Basic",
    content: cell.id,
});

/**
 * Encode a morphism endpoint into the document's object notation. The shape is
 * chosen from the morphism type: a list-modality `Hom` (e.g. a Petri-net
 * transition) wraps an array of cells as a tensor product over the modality's
 * list; any other morphism type encodes a single object cell as a basic
 * object.
 */
const encodeEndpoint = (morType: MorType, value: unknown): Ob | null => {
    const modality = morTypeListModality(morType);
    if (modality !== null) {
        const cells = Array.isArray(value) ? value : value == null ? [] : [value];
        return {
            tag: "App",
            content: {
                op: { tag: "Basic", content: "tensor" },
                ob: {
                    tag: "List",
                    content: {
                        modality,
                        objects: cells.map((cell) =>
                            encodeObjectRef(cell as { readonly id: string }),
                        ),
                    },
                },
            },
        };
    }
    if (value == null) {
        return null;
    }
    return encodeObjectRef(value as { readonly id: string });
};

function attachNotebook<TShape extends AnyShape, Handle>(
    store: DocumentStore<Handle>,
    handle: Handle,
    shape: TShape,
): Notebook<TShape, Handle> {
    const doc = store.viewDocument(handle);
    const change = (fn: (doc: ModelDocument) => void) => store.changeDocument(handle, fn);
    const copy = store.copyValue ? <T>(value: T) => store.copyValue!(handle, value) : undefined;

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

    const objectHandle = <O extends ObType>(cellId: string, type: O): ObjectCell<O> =>
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
        }) as unknown as ObjectCell<O>;

    const objectHandleForId = (objectId: string): ObjectCell => {
        for (const candidateCellId of doc.notebook.cellOrder) {
            const cell = doc.notebook.cellContents[candidateCellId];
            if (cell?.tag !== "formal" || cell.content.tag !== "object") {
                continue;
            }
            if (cell.content.id === objectId) {
                return objectHandle(candidateCellId, cell.content.obType);
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
    morphism type's modality rather than from the stored value's shape. */
    const decodeEndpoint = (morType: MorType, value: Ob | null): ObjectCell | ObjectCell[] => {
        const objects = decodeEndpointObjects(value);
        if (morTypeListModality(morType) !== null) {
            return objects;
        }
        return objects[0] as ObjectCell;
    };

    const morphismHandle = <M extends MorType>(cellId: string, type: M): MorphismCell<M> =>
        ({
            kind: CellKind.Morphism,
            get id() {
                return readCellContent<{ id: string }>(cellId).id;
            },
            type,
            get name() {
                return readCellContent<{ name: string }>(cellId).name;
            },
            get dom() {
                return decodeEndpoint(type, readCellContent<{ dom: Ob | null }>(cellId).dom);
            },
            get cod() {
                return decodeEndpoint(type, readCellContent<{ cod: Ob | null }>(cellId).cod);
            },
            update(u: { name?: string; dom?: unknown; cod?: unknown }) {
                change((d) => {
                    const content = (
                        d.notebook.cellContents[cellId] as {
                            content: { name: string; dom: Ob | null; cod: Ob | null };
                        }
                    ).content;
                    if (u.name !== undefined) {
                        content.name = u.name;
                    }
                    if ("dom" in u) {
                        content.dom = encodeEndpoint(type, u.dom);
                    }
                    if ("cod" in u) {
                        content.cod = encodeEndpoint(type, u.cod);
                    }
                });
            },
            duplicate() {
                return morphismHandle(appendDuplicate(cellId), type);
            },
            ...reorderMethods(cellId),
        }) as unknown as MorphismCell<M>;

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

    const isShapeMorphism = (type: MorType): boolean =>
        Object.values(shape.morphisms ?? {}).some((t) => sameTypeValue(t, type));

    const isShapeObject = (type: ObType): boolean =>
        Object.values(shape.objects ?? {}).some((t) => sameTypeValue(t, type));

    const addObjectCell = (type: ObType, name: string): ObjectCell => {
        const judgment = newObjectDecl(type);
        judgment.name = name;
        const formalCell = newFormalCell(judgment);
        change((d) => {
            d.notebook.cellContents[formalCell.id] = formalCell;
            d.notebook.cellOrder.push(formalCell.id);
        });
        return objectHandle(formalCell.id, type);
    };

    const addMorphismCell = (
        type: MorType,
        args: { name: string; dom?: unknown; cod?: unknown },
    ): MorphismCell => {
        const judgment = newMorphismDecl(type);
        judgment.name = args.name;
        judgment.dom = encodeEndpoint(type, args.dom);
        judgment.cod = encodeEndpoint(type, args.cod);
        const formalCell = newFormalCell(judgment);
        change((d) => {
            d.notebook.cellContents[formalCell.id] = formalCell;
            d.notebook.cellOrder.push(formalCell.id);
        });
        return morphismHandle(formalCell.id, type);
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
        validate(coreTheory?: DblTheory): ModelValidationResult {
            const theory = coreTheory ?? shape.coreTheory;
            if (!theory) {
                throw new Error(
                    "validate() needs a core theory: this shape has no `coreTheory`, " +
                        "so pass one explicitly.",
                );
            }
            const snapshot = copy ? copy(doc) : structuredClone(doc);
            let model: DblModel;
            try {
                model = elaborateModel(
                    snapshot.notebook as unknown as WasmModelNotebook,
                    new DblModelMap(),
                    theory,
                    v7(),
                );
            } catch (e) {
                return { tag: "Illformed", model: null, error: String(e) };
            }
            const result = model.validate();
            if (result.tag === "Ok") {
                return { tag: "Valid", model };
            }
            return { tag: "Invalid", model, errors: result.content };
        },
        migrate<TTarget extends CreatableShape>(targetShape: TTarget) {
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

            const snapshot = copy ? copy(doc) : structuredClone(doc);
            let model: DblModel;
            try {
                model = elaborateModel(
                    snapshot.notebook as unknown as WasmModelNotebook,
                    new DblModelMap(),
                    shape.coreTheory,
                    v7(),
                );
            } catch (e) {
                throw new Error(
                    `Cannot migrate notebook from "${shape.theory}" to ` +
                        `"${targetShape.theory}": the model failed to elaborate (${String(e)}).`,
                    { cause: e },
                );
            }

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
        supports(arg: ObType | MorType | AnyShape): boolean {
            // A shape declares `objects`/`morphisms`; a bare type carries a `tag`.
            if ("objects" in arg || "morphisms" in arg) {
                const other = arg as AnyShape;
                return (
                    Object.values(other.objects ?? {}).every((t) => isShapeObject(t)) &&
                    Object.values(other.morphisms ?? {}).every((t) => isShapeMorphism(t))
                );
            }
            const cellType = arg as ObType | MorType;
            switch (cellType.tag) {
                case "Hom":
                case "Composite":
                    return isShapeMorphism(cellType as MorType);
                default:
                    return (
                        isShapeMorphism(cellType as MorType) || isShapeObject(cellType as ObType)
                    );
            }
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
                        return objectHandle(cellId, judgment.obType);
                    case "morphism":
                        return morphismHandle(cellId, judgment.morType);
                    default:
                        throw new Error(`Unsupported judgment tag: ${judgment.tag}`);
                }
            });
        },
        add(
            type: unknown,
            args: { content?: string; name?: string; dom?: unknown; cod?: unknown },
        ) {
            if (isRichTextType(type)) {
                const cell = newRichTextCell((args as { content: string }).content);
                change((d) => {
                    d.notebook.cellContents[cell.id] = cell;
                    d.notebook.cellOrder.push(cell.id);
                });
                return richTextHandle(cell.id);
            }
            const cellType = type as ObType | MorType;
            const looksLikeMorphism =
                cellType.tag === "Hom" ||
                cellType.tag === "Composite" ||
                "dom" in args ||
                "cod" in args ||
                isShapeMorphism(cellType as MorType);
            if (looksLikeMorphism) {
                return addMorphismCell(cellType as MorType, args as { name: string });
            }
            return addObjectCell(cellType as ObType, (args as { name: string }).name);
        },
    } as unknown as Notebook<TShape, Handle>;
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
export type Notebook<TShape extends AnyShape = AnyShape, Handle = ModelDocument> = Update<{
    name: string;
}> & {
    /**
     * Phantom carrier of the shape's declared types, present only in the type:
     * the runtime object never provides it. It exists so shape assignability is
     * decided by the declared cell types rather than collapsing under the
     * method-bivariance of the rest of the surface. Declared as a *method* so
     * its parameter is compared bivariantly: a notebook is assignable to another
     * when its declared types are a subset of, or a superset of, the target's —
     * which accepts a notebook that declares a subset of a union shape's types
     * (e.g. `PetriNet` into a union of list shapes) and against the widest
     * `Notebook` (whose declared types are all of `ObType | MorType`), while
     * rejecting one whose types are foreign to the target (e.g. `SimpleOlog`).
     */
    __shapeBound?(declared: DeclaredTypes<TShape>): void;
    /**
     * Phantom carrier of whether the shape declares any morphism type, present
     * only in the type. It complements {@link __shapeBound}: that member relates
     * declared types by subset/superset, so a notebook declaring a *subset* of a
     * target's types is accepted — which lets one whose only declared type is a
     * shared *object* slip through even though it declares none of the target's
     * morphisms (an empty morphism set never produces the foreign type that the
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
     * object.
     */
    readonly document: ModelDocument;
    /** Make a detached plain-JS snapshot of the underlying document. */
    dump(): ModelDocument;
    /**
     * Elaborate the notebook into a core model and validate it. Returns a
     * tagged result: `Valid` with the model, `Invalid` with the model and its
     * validation errors, or `Illformed` if elaboration itself failed.
     *
     * The core theory to elaborate into defaults to the shape's `coreTheory`;
     * pass one explicitly to elaborate against a different theory, or when the
     * shape has no `coreTheory`.
     */
    validate(coreTheory?: DblTheory): ModelValidationResult;
    /**
     * Migrate the notebook's document to another shape, **mutating it in
     * place**: the underlying document is rewritten to the target theory rather
     * than copied. Returns a new notebook handle bound to the target shape; the
     * original handle is now stale, so continue through the returned handle.
     * Throws if no migration to the target is defined.
     */
    migrate<TTarget extends CreatableShape>(targetShape: TTarget): Notebook<TTarget, Handle>;
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
    /** Handles for all cells, in notebook order. */
    cells(): Array<NotebookCell<TShape>>;
    /**
     * Add a cell to the notebook. The kind of cell is selected by the first
     * argument:
     *
     * - {@link RichText} adds a rich-text cell; `args` is `{ content }`.
     * - A morphism type from the shape adds a morphism cell; `args` is
     *   `{ name, dom, cod }`, with `dom`/`cod` constrained by the morphism type.
     * - An object type from the shape adds an object cell; `args` is `{ name }`.
     */
    add(type: RichTextType, args: { content: string }): RichTextCell;
    add<M extends ShapeMorphisms<TShape>>(
        type: M,
        args: { name: string; dom: DomOf<M>; cod: CodOf<M> },
    ): MorphismCell<M>;
    add<O extends ShapeObjects<TShape>>(type: O, args: { name: string }): ObjectCell<O>;
};

/**
 * Entry points for notebooks over a fixed store. Obtain one with
 * `createBinder`.
 */
export interface Binder<Handle> {
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
    return {
        createNotebook(shape, data) {
            const seed = newModelDocument({ theory: shape.theory });
            seed.name = data.name;
            return this.loadNotebook(shape, seed);
        },
        loadNotebook(shape, document) {
            if (document.theory !== shape.theory) {
                throw new Error(
                    `Cannot load document with theory "${document.theory}" ` +
                        `using a shape with theory "${shape.theory}".`,
                );
            }
            return attachNotebook(store, store.createHandle(document), shape);
        },
        loadNotebookFromHandle(shape, handle) {
            return attachNotebook(store, handle, shape);
        },
    };
}

/** A ready-made binder over the plain in-memory store. */
export const binder: Binder<ModelDocument> = createBinder(plainStore);
