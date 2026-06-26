import type {
    AnalysisType,
    Document,
    Link,
    Modality,
    MorType,
    Ob,
    ObOp,
    ObType,
    SpecializeModel,
} from "catcolab-document-types";
import type { DblModel, DblTheory, InvalidDblModel } from "catlog-wasm";
import type { Notebook } from "./notebook";

const richTextKind: unique symbol = Symbol("richText");
const objectKind: unique symbol = Symbol("object");
const morphismKind: unique symbol = Symbol("morphism");
const instantiationKind: unique symbol = Symbol("instantiation");
const analysisKind: unique symbol = Symbol("analysis");

/** Precise discriminants for notebook cell handles. */
export const CellKind = {
    RichText: richTextKind,
    Object: objectKind,
    Morphism: morphismKind,
    Instantiation: instantiationKind,
    Analysis: analysisKind,
} as const;

const richTextTypeBrand: unique symbol = Symbol("richTextType");
const instantiationTypeBrand: unique symbol = Symbol("instantiationType");

/**
 * The sentinel cell-type used to add rich-text cells to a notebook. Pass it
 * as the first argument to {@link Notebook.add}; the second argument is
 * `{ content: string }`. Unlike object and morphism types, `RichText` is not
 * an `ObType`/`MorType`; it lives at the top level.
 */
export type RichTextType = { readonly [richTextTypeBrand]: true };

/** The singleton {@link RichTextType} value. */
export const RichText: RichTextType = { [richTextTypeBrand]: true };

export const isRichTextType = (value: unknown): value is RichTextType =>
    typeof value === "object" &&
    value !== null &&
    (value as RichTextType)[richTextTypeBrand] === true;

/** The sentinel cell-type used to add model instantiations to a notebook. */
export type InstantiationType = { readonly [instantiationTypeBrand]: true };

/** The singleton {@link InstantiationType} value. */
export const Instantiation: InstantiationType = { [instantiationTypeBrand]: true };

export const isInstantiationType = (value: unknown): value is InstantiationType =>
    typeof value === "object" &&
    value !== null &&
    (value as InstantiationType)[instantiationTypeBrand] === true;

/** Methods shared by all cell handles for editing a field. */
export type Update<T> = {
    /** Update one or more of the cell's fields. */
    update(args: Partial<T>): void;
};

/** Methods shared by all cell handles for re-ordering and removal. Cells
are identified by id at the moment the change applies, so operations stay
valid even if the notebook was edited after the handle was obtained. */
export type Reorder = {
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
     * handle's fields (e.g. `name`, `content`) return `undefined`. Deleting a
     * cell that is no longer in the notebook is a silent no-op.
     */
    delete(): void;
};

/**
 * A tagged wrapper declaring an object type, built with {@link defineObject}.
 * The `tag` discriminates it from a {@link MorphismDef}, so a `Basic` object
 * and a `Basic` morphism — structurally identical as `ObType`/`MorType` — are
 * told apart by their wrapper rather than by any structural heuristic.
 */
export type ObjectDef<O extends ObType = ObType> = {
    readonly tag: "object";
    readonly obType: O;
};

/** Wrap an `ObType` literal as an {@link ObjectDef}. Declare the result as a
 * `const` and pass it both to a shape's `objects` list and to {@link
 * Notebook.add}. */
export function defineObject<const O extends ObType>(obType: O): ObjectDef<O> {
    return { tag: "object", obType };
}

/**
 * An object-cell handle, parametrized by its {@link ObjectDef}: two object
 * defs with different `obType` values (e.g. a Petri-net `Place`, wrapping
 * `{ tag: "Basic", content: "Object" }`, and a schema `Entity`, wrapping
 * `{ tag: "Basic", content: "Entity" }`) yield distinct, non-interchangeable
 * cell handles. The widest instantiation, `ObjectCell<ObjectDef>` (or the
 * default `ObjectCell`), is the untyped form a generic notebook yields.
 */
export type ObjectCell<Def extends ObjectDef = ObjectDef> = Update<{ name: string }> &
    Reorder & {
        readonly kind: typeof CellKind.Object;
        readonly id: string;
        readonly type: Def;
        readonly name: string;
        duplicate(): ObjectCell<Def>;
    };

/** Modalities whose endpoints are lists of objects rather than a single one. */
type ListModality = "List" | "SymmetricList" | "CocartesianList" | "CartesianList" | "AdditiveList";

/**
 * The endpoint type of a morphism cell, derived from the morphism's `MorType`:
 *
 * - a plain `Hom` over an object type (e.g. a schema `Mapping`,
 *   `Hom(Entity)`) has a single object cell of that type;
 * - any other morphism type does not record its endpoint object type, so its
 *   endpoints stay untyped: a single object cell or a list of them.
 *
 * A morphism whose endpoints are *lists* (e.g. a Petri-net transition) declares
 * a list `modality` instead; its array endpoints are given by {@link
 * ListEndpointOf}. For the precise cases the `MorType` must be a literal, which
 * {@link defineMorphism}'s `const` type parameter preserves automatically.
 */
export type EndpointOf<M extends MorType> = [M] extends [
    { tag: "Hom"; content: infer O extends ObType },
]
    ? ObjectCell<ObjectDef<O>>
    : ObjectCell | ObjectCell[];

/**
 * The array endpoint type of a list morphism (one declared with a `modality`,
 * e.g. a Petri-net transition): an array of object cells of the `Hom`'s object
 * type. The list counterpart of {@link EndpointOf}.
 */
type ListEndpointOf<M extends MorType> = [M] extends [
    { tag: "Hom"; content: infer O extends ObType },
]
    ? ObjectCell<ObjectDef<O>>[]
    : ObjectCell[];

declare const domBrand: unique symbol;
declare const codBrand: unique symbol;
declare const modalityBrand: unique symbol;

/**
 * Phantom carrier of a morphism's endpoint object types. A `Hom` morphism reads
 * its endpoints from its `MorType` structure, but a `Basic` morphism (e.g. a
 * schema `Attr`) records nothing about its source/target in the literal, so
 * {@link defineMorphism} brands it with these. They exist only in the type
 * system; they are never written at runtime.
 */
export type Endpoints<D extends ObType, C extends ObType> = {
    readonly [domBrand]: D;
    readonly [codBrand]: C;
};

/**
 * Phantom carrier of a morphism's list modality, present on *every* {@link
 * MorphismDef}: `Mod` is the list modality for a list morphism (e.g. a
 * Petri-net transition's `SymmetricList`) or `null` for an ordinary morphism.
 * The morphism type itself stays the plain `Hom(Object)` the core theory
 * understands; the list-ness lives here in the type system (driving {@link
 * DomOf}/{@link CodOf} to array endpoints) and in the runtime
 * `domain`/`codomain` endpoint metadata.
 *
 * Because the brand is carried by all morphisms with a *distinct* value per
 * modality (and `null` for none), any two morphisms with different modalities
 * are *mutually* non-assignable — a `List` is interchangeable with neither a
 * `SymmetricList` nor a plain `Hom`. The shape-assignability bivariance (see the
 * `__morphismShapeBound` phantom on {@link Notebook}) depends on this: now that
 * a list morphism's type is structurally the plain `Hom(Object)` shared with
 * e.g. an olog `Aspect`, the modality is the only thing keeping their notebooks
 * from being wrongly interchangeable.
 */
export type ModalityBrand<Mod extends ListModality | null> = {
    readonly [modalityBrand]: Mod;
};

/**
 * A tagged wrapper declaring a morphism type, built with {@link defineMorphism}.
/**
 * Metadata controlling a morphism's domain or codomain, mirroring the
 * frontend's theory `MorDomainMeta`. An `apply` operation (e.g. a Petri-net's
 * `tensor`) turns a list of objects into the single object the endpoint
 * actually is, so its presence is what makes an endpoint list-like; the
 * `modality` is the kind of list that operation consumes. They belong together
 * here, on the endpoint, because the modality is a property of the `apply`
 * operation's domain (the frontend reads it back as `theory.dom(apply)`), not
 * of the morphism as a whole — so the two endpoints may even differ.
 */
export type MorEndpointMeta = {
    readonly apply?: ObOp | undefined;
    readonly modality?: Modality | undefined;
};

/**
 * A tagged wrapper declaring a morphism type, built with {@link defineMorphism}.
 * For a `Hom` morphism the endpoints are derived from its `MorType` structure;
 * for a list morphism (whose `domain`/`codomain` each declare an `apply` op and
 * a `modality`) they are arrays of the `Hom`'s object type, stored as
 * `App(apply, List(modality, …))`: the `apply` operation is what turns a list
 * of objects into the single object the morphism connects, and so is what makes
 * the endpoint list-like. The endpoint operations and modalities live in the
 * runtime `domain`/`codomain` fields; the modality is also carried in the
 * phantom {@link ModalityBrand} for type-level distinctness. For any other
 * morphism (e.g. a `Basic` morphism such as a schema `Attr`) the endpoint
 * object types are carried in the phantom {@link Endpoints} brand.
 */
export type MorphismDef<M extends MorType = MorType> = {
    readonly tag: "morphism";
    readonly morType: M;
    readonly domain?: MorEndpointMeta | undefined;
    readonly codomain?: MorEndpointMeta | undefined;
};

/** The inner `MorType` of a {@link MorphismDef}. */
type MorTypeOf<Def extends MorphismDef> = Def extends MorphismDef<infer M> ? M : never;

/**
 * Declare a morphism type as a {@link MorphismDef}.
 *
 * - For a plain `Hom` morphism, the endpoint object type is read from the
 *   `MorType` structure, so only the morphism type is passed.
 * - For a list morphism (e.g. a Petri-net transition), pass `{ domain, codomain
 *   }` whose endpoints each declare an `apply` op and a `modality`, such as `{
 *   domain: { apply: { tag: "Basic", content: "tensor" }, modality:
 *   "SymmetricList" }, codomain: { … } }`. The morphism type stays the plain
 *   `Hom(Object)` the core theory understands; each `apply` operation turns a
 *   list into the single object the endpoint connects, so endpoints are stored
 *   as `App(apply, List(modality, …))` (see {@link encodeEndpoint}) and read
 *   back as arrays. The operations and modalities live in the runtime
 *   `domain`/`codomain` fields; the modality is also carried in the phantom
 *   {@link ModalityBrand}.
 * - For any other morphism (e.g. a `Basic` morphism, such as a schema `Attr`),
 *   the endpoint object types are not recorded in the literal, so each is
 *   passed as the endpoint's `ObType` in the same `{ domain, codomain }`
 *   options object, e.g. `{ domain: Entity.obType, codomain: AttrType.obType
 *   }`; they are carried in the phantom {@link Endpoints} brand.
 *
 * The `{ domain, codomain }` options are thus unified across the `Basic` and
 * list `Hom` cases: each endpoint is either an `ObType` (a single object of
 * that type) or an `apply` definition `{ apply, modality }` (a list endpoint).
 *
 * Every result carries a {@link ModalityBrand} (`null` when no modality is
 * declared) so list and non-list morphisms are mutually non-assignable.
 */
export function defineMorphism<const M extends MorType & { tag: "Hom" }>(
    morType: M,
): MorphismDef<M> & ModalityBrand<null>;
export function defineMorphism<
    const M extends MorType & { tag: "Hom" },
    const DomMod extends ListModality,
    const CodMod extends ListModality,
>(
    morType: M,
    options: {
        domain: { apply: ObOp; modality: DomMod };
        codomain: { apply: ObOp; modality: CodMod };
    },
): MorphismDef<M> & ModalityBrand<DomMod | CodMod>;
export function defineMorphism<
    const M extends MorType,
    const D extends ObType,
    const C extends ObType,
>(
    morType: M,
    options: { domain: D; codomain: C },
): MorphismDef<M> & Endpoints<D, C> & ModalityBrand<null>;
export function defineMorphism(
    morType: MorType,
    options?: {
        domain?: ObType | MorEndpointMeta;
        codomain?: ObType | MorEndpointMeta;
    },
): MorphismDef {
    // An endpoint is either an `ObType` (`{ tag, content }`) — a single object
    // of that type, recorded only in the phantom {@link Endpoints} brand and so
    // contributing no runtime metadata — or an `apply` definition (`{ apply,
    // modality }`) for a list endpoint, whose `apply`/`modality` are the only
    // fields the runtime reads (see {@link encodeEndpoint}).
    const toMeta = (endpoint: ObType | MorEndpointMeta | undefined): MorEndpointMeta | undefined =>
        endpoint && ("apply" in endpoint || "modality" in endpoint)
            ? (endpoint as MorEndpointMeta)
            : undefined;
    return {
        tag: "morphism",
        morType,
        domain: toMeta(options?.domain),
        codomain: toMeta(options?.codomain),
    };
}

/**
 * The domain endpoint type of a morphism cell. A {@link defineMorphism}-branded
 * morphism uses its declared domain; otherwise the endpoints are derived from
 * the morphism type via {@link EndpointOf}.
 */
export type DomOf<Def extends MorphismDef> = [Def] extends [ModalityBrand<ListModality>]
    ? ListEndpointOf<MorTypeOf<Def>>
    : [Def] extends [Endpoints<infer D extends ObType, ObType>]
      ? ObjectCell<ObjectDef<D>>
      : EndpointOf<MorTypeOf<Def>>;

/** The codomain endpoint type of a morphism cell; see {@link DomOf}. */
export type CodOf<Def extends MorphismDef> = [Def] extends [ModalityBrand<ListModality>]
    ? ListEndpointOf<MorTypeOf<Def>>
    : [Def] extends [Endpoints<ObType, infer C extends ObType>]
      ? ObjectCell<ObjectDef<C>>
      : EndpointOf<MorTypeOf<Def>>;

/**
 * A morphism-cell handle, parametrized by its {@link MorphismDef}. The domain
 * and codomain types are derived by {@link DomOf}/{@link CodOf}, so wiring an
 * endpoint of the wrong object type, or a single object where a list is
 * required, is a compile error. The widest instantiation,
 * `MorphismCell<MorphismDef>` (or the default `MorphismCell`), is the untyped
 * form a generic notebook yields; its endpoints are then the union of a single
 * object cell or a list, so reading a single field like `cell.from.name` is a
 * type error.
 */
export type MorphismCell<Def extends MorphismDef = MorphismDef> = Update<{
    name: string;
    from: DomOf<Def>;
    to: CodOf<Def>;
}> &
    Reorder & {
        readonly kind: typeof CellKind.Morphism;
        readonly id: string;
        readonly type: Def;
        readonly name: string;
        readonly from: DomOf<Def>;
        readonly to: CodOf<Def>;
        duplicate(): MorphismCell<Def>;
    };

export type RichTextCell = Update<{ content: string }> &
    Reorder & {
        readonly kind: typeof CellKind.RichText;
        readonly id: string;
        readonly content: string;
    };

export type InstantiationSpecialization = {
    readonly object: ObjectCell;
    readonly as: ObjectCell;
};

/**
 * A notebook that can be {@link Notebook.validate}d, i.e. whose shape declares a
 * `coreTheory`. An instantiation resolves its referenced model by validating it,
 * so only a validatable notebook may be an instantiation's `model`; a notebook
 * over a shape without a `coreTheory` is rejected at compile time. A notebook
 * over a richer shape stays assignable here, since `validate` is the structural
 * marker {@link CoreTheoryMethods} adds exactly when the shape has a core theory.
 */
export type ValidatableNotebook<Handle = Document> = Notebook<AnyShape, Handle> & {
    validate(): Promise<ModelValidationResult>;
};

export type InstantiationArgs<Handle = unknown> = {
    name: string;
    /**
     * The referenced model: a {@link ValidatableNotebook} (its shape must
     * declare a `coreTheory`, so it can be resolved by validation), or `null`
     * for none. A reference is made by passing the notebook itself, not a
     * {@link Link}; the cell records the corresponding link internally.
     */
    model: ValidatableNotebook<Handle> | null;
    specializations?: readonly InstantiationSpecialization[];
};

export type InstantiationCell<Handle = unknown> = Update<Partial<InstantiationArgs<Handle>>> &
    Reorder & {
        readonly kind: typeof CellKind.Instantiation;
        readonly id: string;
        readonly name: string;
        readonly model: Link | null;
        readonly specializations: readonly SpecializeModel[];
        duplicate(): InstantiationCell<Handle>;
    };

/**
 * The union of object-cell handles a shape declares, one member per object
 * type listed in the shape. Distributing over the shape's listed types (rather
 * than over the internal {@link ObType} union) keeps each declared type a
 * distinct, discriminable member; for the default {@link AnyShape} it collapses
 * to the widest {@link ObjectCell}.
 */
type ObjectCellsOf<TShape extends AnyShape> = TShape extends AnyShape
    ? ObjectCellTuple<ShapeObjectList<TShape>>[number]
    : never;

/**
 * Map a shape's object list to a parallel list of object-cell handles. Taking
 * the list as an array type parameter makes this a homomorphic mapped type over
 * the tuple, so distribution happens over the tuple's *positions* (one handle
 * per listed def) rather than over the internal {@link ObjectDef} union — the
 * base `Shape` (whose element is the whole `ObjectDef`) collapses to the single
 * widest {@link ObjectCell}.
 */
type ObjectCellTuple<Os extends readonly ObjectDef[]> = {
    [K in keyof Os]: ObjectCell<Os[K] & ObjectDef>;
};

/** The union of morphism-cell handles a shape declares; see {@link ObjectCellsOf}. */
type MorphismCellsOf<TShape extends AnyShape> = TShape extends AnyShape
    ? MorphismCellTuple<ShapeMorphismList<TShape>>[number]
    : never;

/** Morphism-side counterpart of {@link ObjectCellTuple}. */
type MorphismCellTuple<Ms extends readonly MorphismDef[]> = {
    [K in keyof Ms]: MorphismCell<Ms[K] & MorphismDef>;
};

/**
 * The union of analysis-cell handles a shape declares; see {@link
 * ObjectCellsOf}. Gated on {@link HasAnalyses} so only an analysis shape
 * contributes analysis cells: an ordinary model shape (and the base {@link
 * Shape}, whose `analyses` key is merely optional) contributes `never`, keeping
 * `AnalysisCell` out of a model notebook's {@link NotebookCell} union.
 */
export type AnalysisCellsOf<TShape extends AnyShape> = TShape extends AnyShape
    ? HasAnalyses<TShape> extends true
        ? AnalysisCellTuple<ShapeAnalysisList<TShape>>[number]
        : never
    : never;

/** Analysis-side counterpart of {@link ObjectCellTuple}. */
type AnalysisCellTuple<As extends readonly AnalysisDef[]> = {
    [K in keyof As]: AnalysisCell<As[K] & AnalysisDef>;
};

/**
 * The union of cell handles that iterating a notebook with {@link
 * Notebook.cells} yields, parametrized by the notebook's {@link Shape}. Each of
 * the shape's object and morphism types contributes its own precise handle
 * (e.g. a Petri-net `NotebookCell<typeof PetriNet>` is `RichTextCell |
 * PlaceCell | TransitionCell`), so a single-type endpoint like `cell.from.name`
 * type-checks after discriminating on `cell.kind`.
 *
 * The default {@link AnyShape} instantiation (the bare `NotebookCell`) widens
 * the object and morphism members to `ObjectCell`/`MorphismCell`; recover
 * precise handles with {@link Notebook.cellsOf}.
 */
export type NotebookCell<TShape extends AnyShape = AnyShape> =
    | RichTextCell
    | InstantiationCell
    | ObjectCellsOf<TShape>
    | MorphismCellsOf<TShape>
    | AnalysisCellsOf<TShape>;

/**
 * A pushforward migration from this shape to another. Mirrors the core: it
 * transports an elaborated model along a theory morphism into the target
 * theory. The target's core theory is supplied by the caller of `migrateTo`.
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
 * Object and morphism types are tagged wrappers built with {@link
 * defineObject}/{@link defineMorphism}; declare each as a `const` so its
 * structure (and a morphism's endpoint object type) survives type inference.
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
    /**
     * Object defs, as a list. Declare each as a standalone `const`
     * (e.g. `const Place = defineObject({ tag: "Basic", content: "Object" })`)
     * and pass it both here and to {@link Notebook.add}. Omit for a shape that
     * declares no objects.
     */
    readonly objects?: readonly ObjectDef[];
    /**
     * Morphism defs, as a list; see {@link Shape.objects}. Omit for a shape
     * that declares no morphisms.
     */
    readonly morphisms?: readonly MorphismDef[];
    /** Theories this shape includes into (trivial migration target). */
    readonly inclusions?: readonly string[];
    /** Non-trivial migrations to other shapes, keyed by target theory. */
    readonly migrations?: readonly ModelMigration[];
    /**
     * Analyses that can be added to an analysis notebook for this shape.
     * When present, `defineShape` attaches an `.Analysis` property — itself a
     * {@link Shape} declaring these as its `analyses` — that can be passed to
     * {@link Binder.createNotebook} to create an analysis notebook.
     */
    readonly modelAnalyses?: readonly AnalysisDef[];
    /**
     * The analyses an *analysis* shape declares. A notebook over a shape with
     * `analyses` is an analysis notebook: its {@link Notebook.add} accepts these
     * analysis defs, and its cells store analysis params rather than model
     * judgments. Absent for an ordinary model shape; populated by the `.Analysis`
     * shape that {@link defineShape} derives from `modelAnalyses`.
     */
    readonly analyses?: readonly AnalysisDef[];
    /**
     * Whether an analysis shape analyzes a model or a diagram. Present exactly
     * when {@link Shape.analyses} is, and surfaced as {@link Notebook.analysisType}.
     */
    readonly analysisType?: AnalysisType;
};

/** Any shape, used as the default and as a generic constraint. */
export type AnyShape = Shape;

/**
 * A shape's object list, defaulting an omitted `objects` to the empty tuple so
 * `[number]` indexing stays well-defined for shapes that declare none. Presence
 * is tested by key (`"objects" extends keyof TShape`) rather than by the
 * property's value type: a concrete shape that omits `objects` has no such key,
 * whereas the base {@link Shape} (whose key is merely optional) still resolves
 * to the widest `readonly ObType[]`.
 */
type ShapeObjectList<TShape extends AnyShape> = "objects" extends keyof TShape
    ? NonNullable<TShape["objects"]>
    : readonly [];
/** A shape's morphism list; see {@link ShapeObjectList}. */
type ShapeMorphismList<TShape extends AnyShape> = "morphisms" extends keyof TShape
    ? NonNullable<TShape["morphisms"]>
    : readonly [];

/**
 * Whether a shape *definitely* declares a `coreTheory`. Tested by requiredness
 * rather than mere key presence: a concrete shape built with {@link
 * defineShape} that provides `coreTheory` has it as a required property (so
 * `true`), whereas one that omits it — and the base {@link Shape}, whose
 * `coreTheory` key is only optional — resolves to `false`. This gates {@link
 * Notebook.validate} and {@link Notebook.migrateTo}, both of which elaborate
 * into the shape's core theory, so calling them on a shape that may lack one is
 * a compile error rather than a runtime throw. The fully-generic `Notebook`
 * (over the base {@link Shape}) therefore exposes neither, which is what keeps a
 * concrete coreTheory-less notebook assignable to it.
 */
export type HasCoreTheory<TShape extends AnyShape> =
    {} extends Pick<TShape, "coreTheory" & keyof TShape> ? false : true;

/** The list element types, defaulted to the widest def for indexing safety. */
type ObjectDefOf<TShape extends AnyShape> = ShapeObjectList<TShape>[number] & ObjectDef;
type MorphismDefOf<TShape extends AnyShape> = ShapeMorphismList<TShape>[number] & MorphismDef;

/** A shape's analysis list; see {@link ShapeObjectList}. */
type ShapeAnalysisList<TShape extends AnyShape> = "analyses" extends keyof TShape
    ? NonNullable<TShape["analyses"]>
    : readonly [];

/** The analysis def element type, defaulted to the widest def for indexing. */
export type AnalysisDefOf<TShape extends AnyShape> = ShapeAnalysisList<TShape>[number] &
    AnalysisDef;

/**
 * Whether a shape *definitely* declares `analyses`, i.e. is an analysis shape.
 * Tested by requiredness like {@link HasCoreTheory}: a shape built with the
 * `.Analysis` derivation has `analyses` as a required property (so `true`),
 * whereas an ordinary model shape — and the base {@link Shape}, whose `analyses`
 * key is only optional — resolves to `false`. Gates the analysis-only surface
 * ({@link Notebook.analysisType} and the analysis {@link Notebook.add} overload).
 */
export type HasAnalyses<TShape extends AnyShape> =
    {} extends Pick<TShape, "analyses" & keyof TShape> ? false : true;

/** A shape that can originate a document: it carries a document theory. */
export type CreatableShape = Shape & { readonly theory: string };

/**
 * Whether the object def `T` is listed by *every* member of the (possibly
 * union) shape `S`. For each member, `T` either appears in its object list
 * (contributing `never`) or does not (contributing the member itself); the
 * union of those collapses to `never` only when every member lists `T`.
 */
type ObjectInEveryMember<T extends ObjectDef, S extends AnyShape> = [
    S extends AnyShape ? (T extends ShapeObjectList<S>[number] ? never : S) : never,
] extends [never]
    ? true
    : false;
/** Morphism-side counterpart of {@link ObjectInEveryMember}. */
type MorphismInEveryMember<T extends MorphismDef, S extends AnyShape> = [
    S extends AnyShape ? (T extends ShapeMorphismList<S>[number] ? never : S) : never,
] extends [never]
    ? true
    : false;

/**
 * The union of a shape's object defs. Deliberately *not* distributive over a
 * union of shapes: it yields only the object defs every member declares, so
 * {@link Notebook.add} over a union shape accepts an object only when it is safe
 * for whichever member the notebook turns out to be. Narrow first with {@link
 * Notebook.supports}.
 */
export type ShapeObjects<TShape extends AnyShape> =
    DeclaredObjects<TShape> extends infer O
        ? O extends ObjectDef
            ? ObjectInEveryMember<O, TShape> extends true
                ? O
                : never
            : never
        : never;
/** The union of a shape's morphism defs; see {@link ShapeObjects} for the union-shape semantics. */
export type ShapeMorphisms<TShape extends AnyShape> =
    DeclaredMorphisms<TShape> extends infer M
        ? M extends MorphismDef
            ? MorphismInEveryMember<M, TShape> extends true
                ? M
                : never
            : never
        : never;

/**
 * Every object and morphism def a shape declares. Unlike {@link ShapeObjects}
 * and {@link ShapeMorphisms}, this *distributes* over a union of shapes, so a
 * union shape's declared defs are the union of all members' declared defs.
 * Carried by the phantom {@link Notebook} member that drives shape assignability
 * (see there): a notebook is assignable to another only when its declared defs
 * relate to the target's, so a notebook whose morphisms are foreign to a union
 * shape (e.g. a `SimpleOlog` against a union of list shapes) is rejected, while
 * one declaring a subset (e.g. a `PetriNet`) is accepted.
 */
export type DeclaredTypes<TShape extends AnyShape> = TShape extends AnyShape
    ? ObjectDefOf<TShape> | MorphismDefOf<TShape>
    : never;

/**
 * The morphism defs a shape declares, distributing over a union of shapes like
 * {@link DeclaredTypes} (and unlike {@link ShapeMorphisms}, which collapses to
 * the morphisms shared by every member): the union of every member's morphism
 * defs, or `never` for a shape that declares none.
 */
export type DeclaredMorphisms<TShape extends AnyShape> = TShape extends AnyShape
    ? MorphismDefOf<TShape>
    : never;

/** Whether a shape declares at least one morphism type. */
export type DeclaresMorphism<TShape extends AnyShape> = [DeclaredMorphisms<TShape>] extends [never]
    ? false
    : true;

/** The object defs a shape declares, distributing over a union of shapes; the
 * object-side dual of {@link DeclaredMorphisms}. */
export type DeclaredObjects<TShape extends AnyShape> = TShape extends AnyShape
    ? ObjectDefOf<TShape>
    : never;

/** Whether a shape declares at least one object type. */
export type DeclaresObject<TShape extends AnyShape> = [DeclaredObjects<TShape>] extends [never]
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
 * An object def and a morphism def carry distinct `tag`s, so `T extends
 * MorphismDef` cleanly selects the morphism capability; everything else is an
 * object def.
 */
export type AddCapability<T extends ObjectDef | MorphismDef> = T extends MorphismDef
    ? {
          add(type: T, args: { name: string; from: DomOf<T>; to: CodOf<T> }): MorphismCell<T>;
      }
    : T extends ObjectDef
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
export type ShapeAddCapability<S extends AnyShape> = UnionToIntersection<
    DeclaredTypes<S> extends infer T
        ? T extends ObjectDef | MorphismDef
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
 * An analysis that can be added to an analysis notebook. An analysis has a
 * stable `id`, an `initialContent` factory for default parameters, and a
 * `run` function that computes the analysis result from the analyzed model's
 * elaborated {@link DblModel}. Define one with {@link defineAnalysis}.
 */
export type AnalysisDef<
    Params extends Record<string, unknown> = Record<string, unknown>,
    Output = unknown,
> = {
    readonly id: string;
    initialContent(): Params;
    run(model: DblModel, params: Params): Promise<Output>;
};

/** Define an analysis from a compact spec. */
export function defineAnalysis<Params extends Record<string, unknown>, Output>(spec: {
    id: string;
    initialContent(): Params;
    run(model: DblModel, params: Params): Promise<Output>;
}): AnalysisDef<Params, Output> {
    return spec;
}

/** Extract the `Params` type from an `AnalysisDef`. */
export type ParamsOf<Def extends AnalysisDef> =
    Def extends AnalysisDef<infer P, unknown> ? P : Record<string, unknown>;

/** Extract the `Output` type from an `AnalysisDef`. */
export type OutputOf<Def extends AnalysisDef> =
    Def extends AnalysisDef<Record<string, unknown>, infer O> ? O : unknown;

/**
 * A handle for an analysis cell in an analysis notebook (a {@link Notebook}
 * over an {@link AnalysisShape}). The persisted `params` are seeded by
 * `def.initialContent()` and updated with {@link AnalysisCell.update}; `run()`
 * resolves the analyzed model's elaborated {@link DblModel} from the document's
 * `analysis-of` link through the store (via {@link DocumentStore.getHandle},
 * elaborating against the shape's `analysisOfCoreTheory`) and calls the def's
 * `run` with that model and the current params.
 */
export type AnalysisCell<Def extends AnalysisDef = AnalysisDef> = Reorder & {
    readonly kind: typeof CellKind.Analysis;
    readonly id: string;
    readonly type: Def;
    /** The persisted parameters for this analysis cell. */
    readonly params: ParamsOf<Def>;
    /** Merge `partial` into the cell's params. */
    update(partial: Partial<ParamsOf<Def>>): void;
    /** Run the analysis, returning its output. */
    run(): Promise<OutputOf<Def>>;
};

/**
 * Define a shape from a compact declaration of object and morphism defs.
 * Object and morphism defs are built with {@link defineObject}/{@link
 * defineMorphism} (declare each as a `const`). A `Hom` morphism's endpoint
 * object type and arity are read from its `MorType` structure; any other
 * morphism declares its endpoints when built with {@link defineMorphism}.
 * `theory`/`coreTheory` are optional: include them for a creatable shape, omit
 * them for a sub-shape contract.
 */
export function defineShape<const TSpec extends Shape>(
    spec: TSpec,
): TSpec &
    ("modelAnalyses" extends keyof TSpec
        ? { readonly Analysis: AnalysisShape<NonNullable<TSpec["modelAnalyses"]>> }
        : object) {
    if (spec.modelAnalyses) {
        const analysisShape: AnalysisShape<NonNullable<TSpec["modelAnalyses"]>> = {
            analyses: spec.modelAnalyses as NonNullable<TSpec["modelAnalyses"]>,
            analysisType: "model",
            ...(spec.coreTheory ? { analysisOfCoreTheory: spec.coreTheory } : {}),
        };
        return { ...spec, Analysis: analysisShape } as ReturnType<typeof defineShape<TSpec>>;
    }
    return spec as ReturnType<typeof defineShape<TSpec>>;
}

/**
 * A {@link Shape} for analysis notebooks: an ordinary shape that declares
 * `analyses` (and an `analysisType`). Obtained via `shape.Analysis` when the
 * shape declares `modelAnalyses`. Pass it to {@link Binder.createNotebook}
 * together with `{ name, of: validatableNotebook }` to create an analysis
 * notebook, just like any other shape.
 */
export type AnalysisShape<Analyses extends readonly AnalysisDef[] = readonly AnalysisDef[]> =
    Shape & {
        readonly analyses: Analyses;
        readonly analysisType: AnalysisType;
        /**
         * The core theory the *analyzed* model elaborates against, copied from
         * the analyzed logic's `coreTheory` by {@link defineShape}. The analysis
         * shape itself carries no `coreTheory` (so it exposes no `validate`),
         * but `run()` needs the analyzed model's core theory to resolve it; this
         * is kept under a distinct key for that purpose.
         */
        readonly analysisOfCoreTheory?: DblTheory;
    };

/** Whether a shape value declares analyses, i.e. is an analysis shape. */
export const isAnalysisShape = (shape: AnyShape): shape is AnalysisShape =>
    Array.isArray((shape as { analyses?: unknown }).analyses);

/** Structural equality of stored type expressions (plain JSON-like values). */
export const sameTypeValue = (a: unknown, b: unknown): boolean => {
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

/** Whether a stored endpoint is a list, recognized by its `App(op, List(...))`
shape: the `apply` operation (e.g. `tensor`) wrapping a `List` is what makes the
endpoint list-like. Returns its modality, or `null` when not a list. Used to
recover a list morphism's modality when reading a cell back from the document. */
export const endpointListModality = (ob: Ob | null): Modality | null => {
    if (ob?.tag === "App" && ob.content.ob.tag === "List") {
        const modality = ob.content.ob.content.modality;
        return LIST_MODALITIES.has(modality) ? modality : null;
    }
    return null;
};

/** The `apply` operation wrapping a stored list endpoint (the counterpart of
{@link endpointListModality}), or `null` when the endpoint is not a list. Used
to recover a list morphism's `domain`/`codomain` `apply` op on read. */
export const endpointApplyOp = (ob: Ob | null): ObOp | null =>
    ob?.tag === "App" && ob.content.ob.tag === "List" ? ob.content.op : null;

/** Encode an object-cell endpoint reference as a model object. */
export const encodeObjectRef = (cell: { readonly id: string }): Ob => ({
    tag: "Basic",
    content: cell.id,
});

/**
 * Encode a morphism endpoint into the document's object notation. The shape is
 * chosen from the morphism's declared `modality` and endpoint `apply` op: a list
 * endpoint (e.g. a Petri-net transition's, `modality: "SymmetricList"` with an
 * `apply: tensor`) wraps an array of cells as `App(apply, List(modality, …))` —
 * the operation turning the list into the single object the endpoint connects;
 * an endpoint with no modality encodes a single object cell as a basic object.
 * This is exactly what the frontend persists, so the morphism type stored in the
 * document stays the plain `Hom(Object)` the core theory exposes as a generator.
 */
export const encodeEndpoint = (
    apply: ObOp | null,
    modality: Modality | null,
    value: unknown,
): Ob | null => {
    if (modality !== null) {
        const cells = Array.isArray(value) ? value : value == null ? [] : [value];
        const list: Ob = {
            tag: "List",
            content: {
                modality,
                objects: cells.map((cell) => encodeObjectRef(cell as { readonly id: string })),
            },
        };
        return apply ? { tag: "App", content: { op: apply, ob: list } } : list;
    }
    if (value == null) {
        return null;
    }
    return encodeObjectRef(value as { readonly id: string });
};
