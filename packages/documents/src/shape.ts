import type {
    AnalysisType,
    Link,
    Modality,
    MorType,
    Ob,
    ObOp,
    ObType,
    SpecializeModel,
} from "catcolab-document-types";
import type {
    DblModel,
    DblModelDiagram,
    DblTheory,
    InvalidDiscreteDblModelDiagram,
} from "catlog-wasm";
import type { Notebook } from "./binder";
import type { RichTextContent } from "./notebook";
import type { NotebookDocument } from "./notebook-document";
import type { RichTextRef } from "./store";
import type { Result } from "./validation";

export type CoreTheoryLoader = () => Promise<DblTheory>;

const coreTheoryCache = new WeakMap<CoreTheoryLoader, Promise<DblTheory>>();

function lazyCoreTheory(load: CoreTheoryLoader): CoreTheoryLoader {
    let cached: Promise<DblTheory> | undefined;

    return () => {
        cached ??= Promise.resolve().then(load);
        return cached;
    };
}

export function resolveCoreTheory(shape: {
    readonly getCoreTheory?: CoreTheoryLoader | undefined;
}): Promise<DblTheory | undefined> {
    const load = shape.getCoreTheory;
    if (!load) {
        return Promise.resolve(undefined);
    }
    let cached = coreTheoryCache.get(load);
    if (!cached) {
        cached = Promise.resolve().then(load);
        coreTheoryCache.set(load, cached);
    }
    return cached;
}

const richTextKind: unique symbol = Symbol("richText");
const objectKind: unique symbol = Symbol("object");
const morphismKind: unique symbol = Symbol("morphism");
const instantiationKind: unique symbol = Symbol("instantiation");
const analysisKind: unique symbol = Symbol("analysis");
const pathEquationKind: unique symbol = Symbol("pathEquation");

/** Precise discriminants for notebook cell handles. */
export const CellKind = {
    RichText: richTextKind,
    Object: objectKind,
    Morphism: morphismKind,
    Instantiation: instantiationKind,
    Analysis: analysisKind,
    PathEquation: pathEquationKind,
} as const;

const richTextTypeBrand: unique symbol = Symbol("richTextType");
const instantiationTypeBrand: unique symbol = Symbol("instantiationType");
const pathEquationTypeBrand: unique symbol = Symbol("pathEquationType");

/**
 * The sentinel cell-type used to add rich-text cells to a notebook. Pass it
 * as the first argument to {@link Notebook.add}; the second argument is
 * `{ content: RichTextContent }`. Unlike object and morphism types,
 * `RichText` is not an `ObType`/`MorType`; it lives at the top level.
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

/**
 * The sentinel cell-type used to add *path equations* to a model notebook:
 * equations between paths of the notebook's morphisms. Pass it as the first
 * argument to {@link Notebook.add}; the second argument is a
 * {@link PathEquationArgs}. A shape opts into path equations by declaring
 * `supportsEquations: true` (see {@link Shape.supportsEquations}); a shape
 * that does not cannot add them.
 */
export type PathEquationType = { readonly [pathEquationTypeBrand]: true };

/** The singleton {@link PathEquationType} value. */
export const PathEquation: PathEquationType = { [pathEquationTypeBrand]: true };

export const isPathEquationType = (value: unknown): value is PathEquationType =>
    typeof value === "object" &&
    value !== null &&
    (value as PathEquationType)[pathEquationTypeBrand] === true;

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
     * handle's fields (e.g. `label`, `content`) return `undefined`. Deleting a
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
    readonly kind: "object";
    /** @internal Compatibility discriminant for stored-definition consumers. */
    readonly tag: "object";
    readonly obType: O;
};

/** Wrap an `ObType` literal as an {@link ObjectDef}. Declare the result as a
 * `const` and pass it both to a shape's `objects` list and to {@link
 * Notebook.add}. */
export function defineObject<const O extends ObType>(obType: O): ObjectDef<O> {
    const definition = { kind: "object" as const, obType };
    Object.defineProperty(definition, "tag", { value: "object" });
    return definition as ObjectDef<O>;
}

/**
 * An object-cell handle, parametrized by its {@link ObjectDef}: two object
 * defs with different `obType` values (e.g. a Petri-net `Place`, wrapping
 * `{ tag: "Basic", content: "Object" }`, and a schema `Entity`, wrapping
 * `{ tag: "Basic", content: "Entity" }`) yield distinct, non-interchangeable
 * cell handles. The widest instantiation, `ObjectCell<ObjectDef>` (or the
 * default `ObjectCell`), is the untyped form a generic notebook yields.
 */
export type ObjectCell<Def extends ObjectDef = ObjectDef> = Update<{ label: string }> &
    Reorder & {
        readonly kind: typeof CellKind.Object;
        readonly id: string;
        readonly type: Def;
        readonly label: string;
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
    /**
     * The object type an endpoint cell must have, recorded so {@link
     * Notebook.add} can reject an endpoint of the wrong type (or from another
     * theory) at runtime — the check the phantom {@link Endpoints} brand makes
     * at compile time. For a `Hom` morphism it is the `Hom`'s object type; for a
     * list morphism it is the list element's object type; for a `Basic`
     * morphism it is the explicitly declared endpoint `ObType`. Absent only for
     * a morphism whose endpoint object type is genuinely unconstrained.
     */
    readonly obType?: ObType | undefined;
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
    readonly kind: "morphism";
    /** @internal Compatibility discriminant for stored-definition consumers. */
    readonly tag: "morphism";
    readonly morType: M;
    /** @internal Normalized endpoint metadata. */
    readonly domain?: MorEndpointMeta | undefined;
    /** @internal Normalized endpoint metadata. */
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
export function defineMorphism<const M extends MorType>(
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
): MorphismDef<M> &
    ModalityBrand<DomMod | CodMod> & {
        readonly endpoints: {
            readonly domain: { readonly apply: ObOp; readonly modality: DomMod };
            readonly codomain: { readonly apply: ObOp; readonly modality: CodMod };
        };
    };
export function defineMorphism<
    const M extends MorType,
    const D extends ObType,
    const C extends ObType,
>(
    morType: M,
    options: { domain: D; codomain: C },
): MorphismDef<M> &
    Endpoints<D, C> &
    ModalityBrand<null> & {
        readonly endpoints: { readonly domain: D; readonly codomain: C };
    };
export function defineMorphism(
    morType: MorType,
    options?: {
        domain?: ObType | MorEndpointMeta;
        codomain?: ObType | MorEndpointMeta;
    },
): MorphismDef {
    // The object type a `Hom` morphism's endpoints connect, read from the
    // `MorType` literal (and shared by both endpoints). A list morphism's
    // endpoints are lists of this same object type; a `Basic` morphism records
    // nothing here, so its endpoint types come from `options` instead.
    const homObType: ObType | undefined =
        morType.tag === "Hom" ? (morType.content as ObType) : undefined;

    // Build the runtime metadata for one endpoint. An endpoint is either an
    // `ObType` (`{ tag, content }`) — a single object of that type — or an
    // `apply` definition (`{ apply, modality }`) for a list endpoint. Either
    // way the endpoint's expected object type is recorded so {@link
    // Notebook.add} can validate it: a `Basic` endpoint supplies it directly,
    // while a `Hom`/list endpoint takes it from the `MorType`.
    const toMeta = (
        endpoint: ObType | MorEndpointMeta | undefined,
    ): MorEndpointMeta | undefined => {
        const isApply = endpoint && ("apply" in endpoint || "modality" in endpoint);
        if (isApply) {
            const meta = endpoint as MorEndpointMeta;
            return { ...meta, obType: meta.obType ?? homObType };
        }
        // A bare `ObType` endpoint (a `Basic` morphism's declared endpoint).
        const obType = (endpoint as ObType | undefined) ?? homObType;
        return obType ? { obType } : undefined;
    };

    const definition = {
        kind: "morphism" as const,
        morType,
    };
    if (options?.domain !== undefined && options.codomain !== undefined) {
        Object.assign(definition, {
            endpoints: { domain: options.domain, codomain: options.codomain },
        });
    }
    Object.defineProperties(definition, {
        tag: { value: "morphism" },
        domain: { value: toMeta(options?.domain) },
        codomain: { value: toMeta(options?.codomain) },
    });
    return definition as MorphismDef;
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
 * object cell or a list, so reading a single field like `cell.from.label` is a
 * type error.
 */
export type MorphismCell<Def extends MorphismDef = MorphismDef> = Update<{
    label: string;
    from: DomOf<Def>;
    to: CodOf<Def>;
}> &
    Reorder & {
        readonly kind: typeof CellKind.Morphism;
        readonly id: string;
        readonly type: Def;
        readonly label: string;
        readonly from: DomOf<Def>;
        readonly to: CodOf<Def>;
        duplicate(): MorphismCell<Def>;
    };

export type RichTextCell = Update<{ content: RichTextContent }> &
    Reorder & {
        readonly kind: typeof CellKind.RichText;
        readonly id: string;
        readonly content: RichTextContent;
        /**
         * The store-native reference an incremental rich-text editor binds to
         * (see {@link RichTextRef}), via {@link DocumentStore.getRichTextRef}.
         * `undefined` when the store cannot bind an incremental editor; the
         * cell's content is then replace-only, through {@link update}.
         */
        readonly editorRef: RichTextRef | undefined;
    };

/**
 * The arguments to {@link Notebook.add} for a path equation cell. Each side is
 * a *path*: an array of the notebook's morphism cells, composed left to right
 * (`[f, g]` is "`f` then `g`"). Either side may be `null` to record an unset
 * side, and `label` may be `null` for an unlabeled equation.
 */
export type PathEquationArgs = {
    label: string | null;
    lhs: readonly MorphismCell[] | null;
    rhs: readonly MorphismCell[] | null;
};

/**
 * A path-equation cell handle: an equation between two paths of the notebook's
 * morphisms. Reading `lhs`/`rhs` yields the morphism cells the stored paths
 * reference, in composition order; a reference to a morphism that has since
 * been deleted is silently omitted, the same graceful degradation as a
 * morphism cell's dangling endpoint. A single-step side is stored as the bare
 * morphism and a longer side as a `Composite` sequence — the same convention
 * the frontend equation editor persists — so `lhs`/`rhs` always read back as
 * arrays regardless of the stored shape.
 */
export type PathEquationCell = Update<{
    label: string;
    lhs: readonly MorphismCell[] | null;
    rhs: readonly MorphismCell[] | null;
}> &
    Reorder & {
        readonly kind: typeof CellKind.PathEquation;
        readonly id: string;
        readonly label: string;
        readonly lhs: MorphismCell[];
        readonly rhs: MorphismCell[];
        duplicate(): PathEquationCell;
    };

/**
 * A tagged wrapper declaring an *individual* type in a diagram: an instance of a
 * model object type, built with {@link defineIndividual}. It carries the {@link
 * ObjectDef} of the model object type its individuals are drawn over (e.g. the
 * olog `Object` type), so {@link Notebook.add} can record the diagram object's
 * `obType` and check that the model object an individual is `over` has that
 * type. Discriminated from {@link AspectDef} by its `tag`.
 */
export type IndividualDef<O extends ObjectDef = ObjectDef> = {
    readonly tag: "individual";
    readonly object: O;
    /** The model object type an individual instantiates. */
    readonly obType: O["obType"];
};

/** Wrap a model {@link ObjectDef} as an {@link IndividualDef}, the diagram-level
 * type for instances of that model object type. */
export function defineIndividual<const O extends ObjectDef>(object: O): IndividualDef<O> {
    return { tag: "individual", object, obType: object.obType };
}

/**
 * A tagged wrapper declaring an *aspect* type in a diagram: an instance of a
 * model morphism type, built with {@link defineAspect}. It carries the {@link
 * MorphismDef} of the model morphism type its aspects are drawn over (e.g. the
 * olog `has` aspect). Discriminated from {@link IndividualDef} by its `tag`.
 */
export type AspectDef<M extends MorphismDef = MorphismDef> = {
    readonly tag: "aspect";
    readonly morphism: M;
    readonly morType: M["morType"];
};

/** Wrap a model {@link MorphismDef} as an {@link AspectDef}, the diagram-level
 * type for instances of that model morphism type. */
export function defineAspect<const M extends MorphismDef>(morphism: M): AspectDef<M> {
    return { tag: "aspect", morphism, morType: morphism.morType };
}

/**
 * An individual-cell handle in a diagram notebook (see {@link Notebook.cells}).
 * Like an {@link ObjectCell} it carries the {@link CellKind.Object} discriminant,
 * but it additionally records the model object it is drawn `over` — an {@link
 * ObjectCell} of the model the diagram is in. Reading `over` yields that model
 * object cell, so `cell.over.label` is the model object's label.
 */
export type IndividualCell<Def extends IndividualDef = IndividualDef> = Update<{
    label: string;
    over: ObjectCell<Def["object"]>;
}> &
    Reorder & {
        readonly kind: typeof CellKind.Object;
        readonly id: string;
        readonly type: Def;
        readonly label: string;
        /** The model object this individual is drawn over. */
        readonly over: ObjectCell<Def["object"]>;
        duplicate(): IndividualCell<Def>;
    };

/**
 * An aspect-cell handle in a diagram notebook (see {@link Notebook.cells}). Like
 * a {@link MorphismCell} it carries the {@link CellKind.Morphism} discriminant,
 * but its `from`/`to` endpoints are diagram {@link IndividualCell}s (single
 * cells, never arrays) and it additionally records the model morphism it is
 * drawn `over` — a {@link MorphismCell} of the model the diagram is in.
 */
export type AspectCell<Def extends AspectDef = AspectDef> = Update<{
    label: string;
    from: IndividualCell;
    to: IndividualCell;
    over: MorphismCell<Def["morphism"]>;
}> &
    Reorder & {
        readonly kind: typeof CellKind.Morphism;
        readonly id: string;
        readonly type: Def;
        readonly label: string;
        readonly from: IndividualCell;
        readonly to: IndividualCell;
        /** The model morphism this aspect is drawn over. */
        readonly over: MorphismCell<Def["morphism"]>;
        duplicate(): AspectCell<Def>;
    };

/**
 * The union of cell handles that iterating a *diagram* notebook with {@link
 * Notebook.cells} yields: rich-text cells plus the diagram's individual and
 * aspect cells. `cell.kind` discriminates an {@link IndividualCell} as {@link
 * CellKind.Object} and an {@link AspectCell} as {@link CellKind.Morphism}, so a
 * `switch` on `kind` narrows to the precise diagram handle.
 */
export type DiagramCell = RichTextCell | IndividualCell | AspectCell;

export type InstantiationSpecialization = {
    readonly object: ObjectCell;
    readonly as: ObjectCell;
};

/**
 * A notebook that can be {@link Notebook.validate}d, i.e. whose shape declares a
 * `getCoreTheory`. An instantiation resolves its referenced model by validating it,
 * so only a validatable notebook may be an instantiation's `model`; a notebook
 * over a shape without a `getCoreTheory` is rejected at compile time. A notebook
 * over a richer shape stays assignable here, since `validate` is the structural
 * marker {@link CoreTheoryMethods} adds exactly when the shape has a core theory.
 *
 * It declares the *whole* core-theory surface — `validate` **and** `migrateTo` —
 * so it mirrors what `CoreTheoryMethods` contributes to a concrete core-theory
 * notebook. That parity lets a `Notebook<PickerShape> & ValidatableNotebook`
 * (a getCoreTheory-less picker shape re-annotated as validatable) stay assignable
 * to a slot typed over a concrete core-theory shape, which also expects
 * `migrateTo`; declaring only `validate` would leave `migrateTo` missing there.
 */
export type ValidatableNotebook<
    // oxlint-disable-next-line typescript/no-explicit-any
    Handle = any,
    TShape extends AnyShape = AnyShape,
> = Notebook<TShape, NotebookDocument, Handle> & {
    validate(): Promise<ModelValidationResult<TShape>>;
    onValidate(callback: (result: ModelValidationResult<TShape>) => void): () => void;
    migrateTo<TTarget extends CreatableShape>(
        targetShape: TTarget,
    ): Promise<Result<Notebook<TTarget, NotebookDocument, Handle>>>;
};

// oxlint-disable-next-line typescript/no-explicit-any
export type InstantiationArgs<Handle = any> = {
    label: string;
    /**
     * The referenced model: a {@link ValidatableNotebook} (its shape must
     * declare a `getCoreTheory`, so it can be resolved by validation), or `null`
     * for none. A reference is made by passing the notebook itself, not a
     * {@link Link}; the cell records the corresponding link internally.
     */
    model: ValidatableNotebook<Handle> | null;
    specializations?: readonly InstantiationSpecialization[];
};

// oxlint-disable-next-line typescript/no-explicit-any
export type InstantiationCell<Handle = any> = Update<Partial<InstantiationArgs<Handle>>> &
    Reorder & {
        readonly kind: typeof CellKind.Instantiation;
        readonly id: string;
        readonly label: string;
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
 * The union of cell handles that filtering a notebook with {@link
 * Notebook.cellsOf} by a sub-shape yields. Unlike {@link NotebookCell} (which
 * describes {@link Notebook.cells} and so always carries `RichTextCell` and
 * `InstantiationCell`), this contains only the cell types the shape declares:
 * each of its object/morphism/analysis types contributes its own precise
 * handle, matching the runtime filter. {@link RichTextCell} is included exactly
 * when the shape declares `informal: [RichText]` (see {@link HasRichText}), and
 * {@link PathEquationCell} exactly when it declares `supportsEquations: true`
 * (see {@link HasPathEquations}).
 * Distributes over a union of shapes like the per-kind helpers it composes.
 */
export type ShapeCellsOf<TShape extends AnyShape> = TShape extends AnyShape
    ?
          | ObjectCellsOf<TShape>
          | MorphismCellsOf<TShape>
          | AnalysisCellsOf<TShape>
          | (HasRichText<TShape> extends true ? RichTextCell : never)
          | (HasPathEquations<TShape> extends true ? PathEquationCell : never)
    : never;

/**
 * A pushforward migration from this shape to another. Mirrors the core: it
 * transports an elaborated model along a theory morphism into the target
 * theory. The resolved target core theory is supplied by the caller of
 * `migrateTo`.
 */
export type ModelMigration = {
    /** Identifier of the document theory migrated into. */
    readonly target: string;
    /**
     * Transport an elaborated model along the morphism into `targetTheory`.
     *
     * The supplied `model` is shared: it comes from the per-store elaboration
     * cache and other consumers (validation, analyses) may hold it too, so the
     * migration must only *read* it — never mutate or free it.
     */
    readonly migrate: (model: DblModel, targetTheory: DblTheory) => Promise<DblModel>;
};

/**
 * A shape describes the object and morphism types a notebook is built from.
 *
 * - With a `theory` (and usually a `getCoreTheory`) it is a full, *creatable*
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
     * Configuration for models that support diagrams and tabular instances.
     * Its `tableObjects` must already be listed in {@link Shape.objects}, and
     * the shape must declare both a `theory` and `getCoreTheory`.
     *
     * Left unset by default: not every theory admits diagrams. In the core,
     * diagrams are only implemented for *discrete* double theories, so a shape
     * over a modal theory (e.g. the symmetric-monoidal theory behind Petri nets)
     * must omit this property and gets no `.Diagram` or instance support.
     */
    readonly supportsInstances?: SupportsInstances;
    /**
     * Cached async loader for the double theory in the core that notebooks of
     * this shape elaborate into. Optional: a sub-shape has none.
     */
    readonly getCoreTheory?: CoreTheoryLoader;
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
     * Informal cell types to include in shape-filtered {@link Notebook.cellsOf}
     * alongside the shape's declared object/morphism cells. Defaults to none: a
     * shape describes formal cell types, so rich text is opted into explicitly
     * with `informal: [RichText]` by editors that render prose interleaved with
     * typed cells.
     */
    readonly informal?: readonly RichTextType[];
    /**
     * Opt-in to *path equation* cells: equations between paths of the
     * notebook's morphisms, declared with `supportsEquations: true`.
     * Defaults to `false`: not every theory supports equations (in the core they
     * are elaborated only for theories with discrete models, mirroring the
     * frontend's per-theory `equationCellMeta` gate), so a shape opts in
     * explicitly and {@link Notebook.add} of a {@link PathEquation} on a shape
     * that has not is a compile error (and a runtime {@link ValidationError}).
     */
    readonly supportsEquations?: boolean;
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
    /**
     * The individual types a *diagram* shape declares. A notebook over a shape
     * with `individuals` is a diagram notebook: its {@link Notebook.add} accepts
     * these individual defs (and the {@link Shape.aspects} below), and its cells
     * store diagram judgments — objects/morphisms drawn `over` a model's — rather
     * than plain model judgments. Absent for an ordinary model shape; populated
     * by the `.Diagram` shape that {@link defineShape} derives for a shape that
     * declares `supportsInstances`.
     */
    readonly individuals?: readonly IndividualDef[];
    /** The aspect types a *diagram* shape declares; see {@link Shape.individuals}. */
    readonly aspects?: readonly AspectDef[];
    /**
     * The core theory the *model* a diagram is drawn in elaborates against,
     * copied from the model logic's `getCoreTheory` by {@link defineShape}. A
     * diagram is elaborated against this theory and validated in that model, so
     * {@link Notebook.validate} on a diagram notebook needs it. Kept under a
     * distinct key from {@link Shape.getCoreTheory} (which a diagram shape leaves
     * absent) for that purpose.
     */
    readonly diagramInCoreTheory?: CoreTheoryLoader;
};

/** Configuration for models that support diagrams and tabular instances. */
export type SupportsInstances = {
    /** Object definitions whose model judgments become tables in an instance. */
    readonly tableObjects: readonly ObjectDef[];
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
 * Whether a shape *definitely* declares a `getCoreTheory`. Tested by requiredness
 * rather than mere key presence: a concrete shape built with {@link
 * defineShape} that provides `getCoreTheory` has it as a required property (so
 * `true`), whereas one that omits it — and the base {@link Shape}, whose
 * `getCoreTheory` key is only optional — resolves to `false`. This gates {@link
 * Notebook.validate} and {@link Notebook.migrateTo}, both of which elaborate
 * into the shape's core theory, so calling them on a shape that may lack one is
 * a compile error rather than a runtime throw. The fully-generic `Notebook`
 * (over the base {@link Shape}) therefore exposes neither, which is what keeps a
 * concrete getCoreTheory-less notebook assignable to it.
 */
export type HasCoreTheory<TShape extends AnyShape> =
    {} extends Pick<TShape, "getCoreTheory" & keyof TShape> ? false : true;

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

/**
 * Whether a shape *definitely* declares `individuals`, i.e. is a diagram shape.
 * Tested by requiredness like {@link HasAnalyses}: a shape built with the
 * `.Diagram` derivation has `individuals` as a required property (so `true`),
 * whereas an ordinary model shape — and the base {@link Shape}, whose
 * `individuals` key is only optional — resolves to `false`.
 */
export type HasDiagram<TShape extends AnyShape> =
    {} extends Pick<TShape, "individuals" & keyof TShape> ? false : true;

/**
 * Whether a shape opts into rich-text cells in {@link Notebook.cellsOf}. A
 * concrete shape built with `informal: [RichText]` resolves to `true`; one that
 * omits `informal`, and the base {@link Shape} (whose key is merely optional),
 * resolve to `false`. Gates the {@link RichTextCell} member of {@link
 * ShapeCellsOf}.
 */
export type HasRichText<TShape extends AnyShape> = "informal" extends keyof TShape
    ? {} extends Pick<TShape, "informal" & keyof TShape>
        ? false
        : RichTextType extends NonNullable<TShape["informal"]>[number]
          ? true
          : false
    : false;

/**
 * Whether a shape opts into path equation cells (see {@link
 * Shape.supportsEquations}). A concrete shape built with `supportsEquations:
 * true` resolves to `true`; one that omits the key or sets it to `false`, and
 * the base {@link Shape} (whose key is merely optional), resolve to `false`.
 * Gates the path-equation {@link Notebook.add} overload and the {@link
 * PathEquationCell} member of {@link ShapeCellsOf}.
 */
export type HasPathEquations<TShape extends AnyShape> = "supportsEquations" extends keyof TShape
    ? {} extends Pick<TShape, "supportsEquations" & keyof TShape>
        ? false
        : NonNullable<TShape["supportsEquations"]> extends true
          ? true
          : false
    : false;

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
 * A function type whose parameter is compared *bivariantly* even under
 * `strictFunctionTypes`: extracting a method's type from an object literal
 * keeps the method-position bivariance at the extracted signature. Carried by
 * the phantom shape-bound members of {@link Notebook}, where bivariance encodes
 * "subset or superset" of declared cell types.
 */
type BivariantBound<T> = { bound(declared: T): void }["bound"];

/**
 * The phantom *object*-axis bound of a {@link Notebook}'s shape. For a single
 * shape it is a bivariant function over the shape's object defs, so one
 * notebook's bound is assignable to another's exactly when its declared object
 * types are a subset or a superset of the target's. Distributes over a union of
 * shapes into a *union of bounds* — one per member — so a notebook is assignable
 * to a union-shape notebook when it matches *some* member, rather than being
 * measured against the pooled object types of all members. That keeps
 * assignability consistent with the member types: a notebook assignable to
 * `Notebook<B>` is also assignable to `Notebook<A | B>`.
 */
export type ObjectShapeBound<TShape extends AnyShape> = TShape extends AnyShape
    ? BivariantBound<ObjectDefOf<TShape>>
    : never;

/** The morphism-axis counterpart of {@link ObjectShapeBound}. */
export type MorphismShapeBound<TShape extends AnyShape> = TShape extends AnyShape
    ? BivariantBound<MorphismDefOf<TShape>>
    : never;

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
          add(type: T, args: { label: string; from: DomOf<T>; to: CodOf<T> }): MorphismCell<T>;
      }
    : T extends ObjectDef
      ? { add(type: T, args: { label: string }): ObjectCell<T> }
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

/**
 * The result of elaborating and validating a model, as a {@link Result}: an
 * `Ok` carries the elaborated {@link DblModel} as `content`; an `Err` carries
 * an array of issues. Both a model that fails one or more validation checks
 * and one that fails to even elaborate map to an `Err`, their errors surfaced
 * as [Standard Schema](https://standardschema.dev) {@link Issue}s.
 */
/**
 * An elaborated object judgment selected by a notebook object definition.
 *
 * Aligned with {@link ObjectCell}: its `label` is a display string (dot-joined
 * qualified segments, `""` when unlabeled) and `type` is the object definition,
 * rather than exposing the raw catlog-wasm presentation.
 */
export type ObjectJudgment<Def extends ObjectDef = ObjectDef> = {
    readonly id: string;
    readonly type: Def;
    readonly label: string;
};

/**
 * An elaborated morphism judgment selected by a notebook morphism definition.
 *
 * Aligned with {@link MorphismCell}: `from`/`to` are the resolved object
 * judgments its domain and codomain point at (available for `Basic` endpoints
 * that resolve to an object in the elaborated model, `undefined` otherwise),
 * and `label` is a display string.
 */
export type MorphismJudgment<Def extends MorphismDef = MorphismDef> = {
    readonly id: string;
    readonly type: Def;
    readonly label: string;
    readonly from: ObjectJudgment | undefined;
    readonly to: ObjectJudgment | undefined;
};

/**
 * A validated core model retaining the shape of the notebook it was elaborated
 * from. `judgmentsOf` enumerates presentation records of one declared type;
 * `get` retrieves one by its qualified identifier using the same `Result`
 * convention as {@link Notebook.get}.
 */
export type ValidatedModel<TShape extends AnyShape = AnyShape> = DblModel & {
    judgmentsOf<Def extends ShapeObjects<TShape>>(type: Def): ObjectJudgment<Def>[];
    judgmentsOf<Def extends ShapeMorphisms<TShape>>(type: Def): MorphismJudgment<Def>[];
    get<Def extends ShapeObjects<TShape>>(type: Def, id: string): Result<ObjectJudgment<Def>>;
    get<Def extends ShapeMorphisms<TShape>>(type: Def, id: string): Result<MorphismJudgment<Def>>;
};

export type ModelValidationResult<TShape extends AnyShape = AnyShape> = Result<
    ValidatedModel<TShape>
>;

/**
 * An analysis that can be added to an analysis notebook. An analysis has a
 * stable `id`, a `getInitialParams` factory for default parameters, and a
 * `run` function that computes the analysis result from the analyzed model's
 * elaborated {@link DblModel}. Define one with {@link defineAnalysis}.
 */
export type AnalysisDef<Params extends object = object, Output = unknown> = {
    readonly id: string;
    getInitialParams(): Params;
    run(model: DblModel, params: Params): Promise<Output>;
};

/** Define an analysis from a compact spec. */
export function defineAnalysis<Params extends object, Output>(spec: {
    id: string;
    getInitialParams(): Params;
    run(model: DblModel, params: Params): Promise<Output>;
}): AnalysisDef<Params, Output> {
    return spec;
}

/** Extract the `Params` type from an `AnalysisDef`. */
export type ParamsOf<Def extends AnalysisDef> =
    Def extends AnalysisDef<infer P, unknown> ? P : Record<string, unknown>;

/** Extract the `Output` type from an `AnalysisDef`. */
export type OutputOf<Def extends AnalysisDef> =
    Def extends AnalysisDef<object, infer O> ? O : unknown;

/**
 * A handle for an analysis cell in an analysis notebook (a {@link Notebook}
 * over an {@link AnalysisShape}). The persisted `params` are seeded by
 * `def.getInitialParams()` and updated with {@link AnalysisCell.update}; `run()`
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
    /**
     * Run the analysis, returning a {@link Result}: an `Ok` carries the
     * analysis output as `content`; an `Err` carries an array of issues.
     * Failures include an unresolvable or invalid analyzed model and any error
     * thrown by the analysis def's `run`.
     */
    run(): Promise<Result<OutputOf<Def>>>;
};

/**
 * The cell handle(s) for `T`, which may be either a *type definition* or a whole
 * *shape*:
 *
 * - Given a **def**, it is the single precise handle for that def's kind: an
 *   {@link ObjectDef} maps to an {@link ObjectCell}, a {@link MorphismDef} to a
 *   {@link MorphismCell}, an {@link AnalysisDef} to an {@link AnalysisCell}, and
 *   the diagram-level {@link IndividualDef}/{@link AspectDef} to an {@link
 *   IndividualCell}/{@link AspectCell}. So `NotebookCell<typeof Place>` is the
 *   precise object-cell handle for a Petri-net `Place`, replacing the longer
 *   `ObjectCell<typeof Place>`.
 * - Given a **shape**, it is the union of cell handles that iterating a notebook
 *   of that shape with {@link Notebook.cells} yields: each of the shape's object
 *   and morphism types contributes its own precise handle plus {@link
 *   RichTextCell}/{@link InstantiationCell} (e.g. a Petri-net
 *   `NotebookCell<typeof PetriNet>` is `RichTextCell | NotebookCell<typeof
 *   Place> | NotebookCell<typeof Transition>`), so a single-type endpoint like
 *   `cell.from.label` type-checks after discriminating on `cell.kind`. The
 *   default {@link AnyShape} instantiation (the bare `NotebookCell`) widens the
 *   object and morphism members to `ObjectCell`/`MorphismCell`; recover precise
 *   handles with {@link Notebook.cellsOf}.
 *
 * The def kinds are matched *first*, before the shape fallback: because {@link
 * Shape}'s keys are all optional, every def structurally satisfies `AnyShape`
 * too, so peeling the defs off first is what keeps a def (e.g. an {@link
 * AnalysisDef}) from being mis-dispatched into the shape union. Any `T` that is
 * neither a recognized def nor a shape yields `never`.
 */
export type NotebookCell<T = AnyShape> = T extends IndividualDef
    ? IndividualCell<T>
    : T extends AspectDef
      ? AspectCell<T>
      : T extends ObjectDef
        ? ObjectCell<T>
        : T extends MorphismDef
          ? MorphismCell<T>
          : T extends AnalysisDef
            ? AnalysisCell<T>
            : T extends AnyShape
              ?
                    | RichTextCell
                    | InstantiationCell
                    | PathEquationCell
                    | ObjectCellsOf<T>
                    | MorphismCellsOf<T>
                    | AnalysisCellsOf<T>
              : never;

/**
 * Define a shape from a compact declaration of object and morphism defs.
 * Object and morphism defs are built with {@link defineObject}/{@link
 * defineMorphism} (declare each as a `const`). A `Hom` morphism's endpoint
 * object type and arity are read from its `MorType` structure; any other
 * morphism declares its endpoints when built with {@link defineMorphism}.
 * `theory`/`getCoreTheory` are optional: include them for a creatable shape, omit
 * them for a sub-shape contract. Set `supportsInstances.tableObjects` (requires
 * both) to derive a `.Diagram` shape for drawing diagrams and to allow its
 * notebooks to be used as schemas for tabular instances.
 */
type ValidateInstanceSupport<TSpec extends Shape> = TSpec extends {
    readonly supportsInstances: {
        readonly tableObjects: readonly (infer TableObject)[];
    };
}
    ? TSpec extends {
          readonly theory: string;
          readonly getCoreTheory: CoreTheoryLoader;
          readonly objects: readonly (infer Object)[];
      }
        ? Exclude<TableObject, Object> extends never
            ? object
            : { readonly __tableObjectsMustBeDeclaredInObjects: never }
        : { readonly __instanceSupportRequiresTheoryCoreTheoryAndObjects: never }
    : object;

export function defineShape<const TSpec extends Shape>(
    spec: TSpec & ValidateInstanceSupport<TSpec>,
): TSpec &
    ("modelAnalyses" extends keyof TSpec
        ? { readonly Analysis: AnalysisShape<NonNullable<TSpec["modelAnalyses"]>> }
        : object) &
    (TSpec extends { supportsInstances: SupportsInstances }
        ? {
              readonly Diagram: DiagramShapeOf<TSpec>;
          }
        : object) {
    const getCoreTheory = spec.getCoreTheory ? lazyCoreTheory(spec.getCoreTheory) : undefined;
    const derived: Shape & {
        Analysis?: AnalysisShape;
        Diagram?: DiagramShape;
    } = {
        ...spec,
        ...(getCoreTheory ? { getCoreTheory } : {}),
    };
    if (spec.modelAnalyses) {
        derived.Analysis = {
            analyses: spec.modelAnalyses as NonNullable<TSpec["modelAnalyses"]>,
            analysisType: "model",
            ...(getCoreTheory ? { analysisOfCoreTheory: getCoreTheory } : {}),
        } satisfies AnalysisShape<NonNullable<TSpec["modelAnalyses"]>>;
    }
    if (spec.supportsInstances) {
        if (spec.theory === undefined || getCoreTheory === undefined) {
            throw new Error("An instance-capable shape must define a theory and its core theory");
        }
        const objects = spec.objects ?? [];
        for (const tableObject of spec.supportsInstances.tableObjects) {
            if (!objects.includes(tableObject)) {
                throw new Error(
                    "Instance table objects must be declared in the shape's objects; " +
                        "each table object must be declared in the shape's `objects` list",
                );
            }
        }
        const individuals = (spec.objects ?? []).map((object) => defineIndividual(object));
        const aspects = (spec.morphisms ?? []).map((morphism) => defineAspect(morphism));
        // `Individual`/`Aspect` are the diagram-level cell types: a single
        // `IndividualDef`/`AspectDef` accepting any of the model's object/morphism
        // types. (A model object cell — not a morphism — for `over`.)
        const Individual = defineIndividual(
            spec.objects?.[0] ?? defineObject({ tag: "Basic", content: "Object" }),
        );
        const Aspect =
            spec.morphisms?.[0] !== undefined ? defineAspect(spec.morphisms[0]) : undefined;
        derived.Diagram = {
            theory: spec.theory,
            individuals,
            aspects,
            Individual,
            ...(Aspect ? { Aspect } : {}),
            ...(getCoreTheory ? { diagramInCoreTheory: getCoreTheory } : {}),
        };
    }
    for (const key of [
        "supportsEquations",
        "modelAnalyses",
        "informal",
        "inclusions",
        "migrations",
        "Analysis",
        "Diagram",
    ] as const) {
        if (key in derived) {
            Object.defineProperty(derived, key, { enumerable: false });
        }
    }
    return derived as ReturnType<typeof defineShape<TSpec>>;
}

/**
 * The diagram shape derived by {@link defineShape} from a model shape that
 * declares `supportsInstances`, exposed as `shape.Diagram`. It declares an {@link IndividualDef} per model
 * object type and an {@link AspectDef} per model morphism type, and surfaces the
 * single diagram cell types {@link DiagramShape.Individual} / {@link
 * DiagramShape.Aspect} to pass to {@link Notebook.add}.
 */
export type DiagramShapeOf<TSpec extends Shape> = DiagramShape & {
    readonly theory: NonNullable<TSpec["theory"]>;
    readonly Individual: IndividualDef<DeclaredObjects<TSpec> & ObjectDef>;
    readonly Aspect: AspectDef<DeclaredMorphisms<TSpec> & MorphismDef>;
};

/**
 * A {@link Shape} for diagram notebooks: a shape that declares `individuals` and
 * `aspects` — the diagram-level types drawn over a model's objects and
 * morphisms. Obtained via `shape.Diagram` on a model shape that declares
 * `supportsInstances`. Pass it to
 * {@link Binder.createNotebook} together with `{ name, in: validatableNotebook }`
 * to create a diagram notebook. It carries the model's `theory` (surfaced as
 * {@link Notebook.theory}) but no `getCoreTheory` of its own; the model's core
 * theory is kept under {@link Shape.diagramInCoreTheory} for validation.
 */
export type DiagramShape = Shape & {
    readonly individuals: readonly IndividualDef[];
    readonly aspects: readonly AspectDef[];
    /** The diagram-level individual cell type to pass to {@link Notebook.add}. */
    readonly Individual: IndividualDef;
    /** The diagram-level aspect cell type to pass to {@link Notebook.add}. */
    readonly Aspect?: AspectDef;
};

/** Whether a shape value declares individuals, i.e. is a diagram shape. */
export const isDiagramShape = (shape: AnyShape): shape is DiagramShape =>
    Array.isArray((shape as { individuals?: unknown }).individuals);

/** An elaborated diagram together with its validation status against its model. */
export type DiagramValidationResult =
    /** Successfully elaborated and validated in its model. */
    | { tag: "Valid"; diagram: DblModelDiagram }
    /** Elaborated, but failing one or more validation checks in its model. */
    | { tag: "Invalid"; diagram: DblModelDiagram; errors: InvalidDiscreteDblModelDiagram[] }
    /** Failed to even elaborate (e.g. its model is ill-formed). */
    | { tag: "Illformed"; diagram: null; error: string };

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
         * the analyzed logic's `getCoreTheory` by {@link defineShape}. The analysis
         * shape itself carries no `getCoreTheory` (so it exposes no `validate`),
         * but `run()` needs the analyzed model's core theory to resolve it; this
         * is kept under a distinct key for that purpose.
         */
        readonly analysisOfCoreTheory?: CoreTheoryLoader;
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

const copyObOp = (op: ObOp): ObOp => ({ tag: op.tag, content: op.content });

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
        return apply ? { tag: "App", content: { op: copyObOp(apply), ob: list } } : list;
    }
    if (value == null) {
        return null;
    }
    return encodeObjectRef(value as { readonly id: string });
};
