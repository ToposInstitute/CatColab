import type { Modality, MorType, ObOp, ObType } from "catcolab-document-types";
import type { DblTheory } from "catlog-wasm";
import { morphismTypesEqual, objectTypesEqual } from "./model/equality";
import type { DeepReadonly } from "./util/deep-readonly";

export interface ObjectType<O extends ObType = ObType> {
    readonly kind: "object";
    readonly obType: O;
}

export interface MorphismType<M extends MorType = MorType> {
    readonly kind: "morphism";
    readonly morType: M;
}

export const RichText = { kind: "rich-text" } as const;

export const PathEquation = { kind: "path-equation" } as const;

export interface Shape {
    readonly theory?: string;
    readonly getCoreTheory?: () => Promise<DblTheory>;
    readonly objects?: Readonly<Record<string, ObjectType>>;
    readonly morphisms?: Readonly<Record<string, MorphismType>>;
    readonly informal?: Readonly<Record<string, RichTextType>>;
    readonly supportsInstances?: {
        readonly tableObjects: Readonly<Record<string, ObjectType>>;
    };
    readonly supportsEquations?: boolean;
    readonly cellTypes?: Readonly<Record<string, AnyCellType>>;
}

export type MorphismEndpoint =
    | ObType
    | { readonly obType: ObType; readonly modality: Modality }
    | {
          readonly apply: ObOp;
          readonly modality: Modality;
      };

export interface MorphismEndpoints {
    readonly domain: MorphismEndpoint;
    readonly codomain: MorphismEndpoint;
}

export function defineObject<const O>(obType: O & ObType): ObjectType<O & ObType> {
    return { kind: "object", obType };
}

export function defineMorphism<const M>(morType: M & MorType): MorphismType<M & MorType>;
export function defineMorphism<const M, const E extends MorphismEndpoints>(
    morType: M & MorType,
    endpoints: E,
): MorphismType<M & MorType> & { readonly endpoints: E };
export function defineMorphism<const M, const E extends MorphismEndpoints>(
    morType: M & MorType,
    endpoints?: E,
): MorphismType<M & MorType> | (MorphismType<M & MorType> & { readonly endpoints: E }) {
    return endpoints ? { kind: "morphism", morType, endpoints } : { kind: "morphism", morType };
}

export function defineShape<const S extends Shape>(
    shape: S,
): S & { readonly cellTypes: Readonly<Record<string, AnyCellType>> } {
    if (shape.supportsInstances) {
        if (!shape.theory || !shape.getCoreTheory) {
            throw new Error("An instance-capable shape must define a theory and its core theory");
        }
        if (
            Object.values(shape.supportsInstances.tableObjects).some(
                (tableObject) => !Object.values(shape.objects ?? {}).includes(tableObject),
            )
        ) {
            throw new Error("Instance table objects must be declared in the shape's objects");
        }
    }

    const entries: Array<[string, AnyCellType]> = [];
    for (const category of [shape.objects, shape.morphisms, shape.informal]) {
        for (const entry of Object.entries(category ?? {})) {
            entries.push(entry);
        }
    }
    if (shape.supportsEquations) {
        entries.push(["PathEquation", PathEquation]);
    }
    const names = new Set<string>();
    for (const [name] of entries) {
        if (names.has(name)) {
            throw new Error(`Duplicate cell type name: ${name}`);
        }
        names.add(name);
    }
    return { ...shape, cellTypes: Object.fromEntries(entries) };
}

/** A shape that declares support for tabular instances of its models. */
export type InstanceCapableShape = Shape & {
    readonly supportsInstances: {
        readonly tableObjects: Readonly<Record<string, ObjectType>>;
    };
};

/** Assert that a schema's shape declares support for instances. */
export function assertInstanceCapableShape(shape: Shape): asserts shape is InstanceCapableShape {
    if (shape.supportsInstances === undefined) {
        throw new Error(`Shape \`${shape.theory ?? "unnamed"}\` does not support instances`);
    }
}

export type RichTextType = typeof RichText;
export type EquationType = typeof PathEquation;

/** The object types declared by a shape: the value types of its `objects` map.
 *
 * This is complicated because TypeScript is a silly language without
 * existential types and it has special capabilities for proving things for
 * `number` that don't work for `keyof`, so we have to pre-empt the
 * heterogeneous list case using some machinery.
 */
export type ObjectTypesOf<S extends Shape> =
    NonNullable<S["objects"]> extends Readonly<Record<string, infer T extends ObjectType>>
        ? T
        : never;

/** The morphism types declared by a shape; see [`ObjectTypesOf`]. */
export type MorphismTypesOf<S extends Shape> =
    NonNullable<S["morphisms"]> extends Readonly<Record<string, infer T extends MorphismType>>
        ? T
        : never;
export type AnyCellType = RichTextType | ObjectType | MorphismType | EquationType;
export type CellTypeOf<S extends Shape> =
    | RichTextType
    | ObjectTypesOf<S>
    | MorphismTypesOf<S>
    | EquationType;

type MatchingObjectTypesOf<O, EndpointObType> = O extends ObjectType
    ? O["obType"] extends EndpointObType
        ? EndpointObType extends O["obType"]
            ? O
            : never
        : never
    : never;

type HomObjectTypesOf<S extends Shape, M extends MorphismType> = M["morType"] extends {
    tag: "Hom";
    content: infer EndpointObType;
}
    ? MatchingObjectTypesOf<ObjectTypesOf<S>, EndpointObType>
    : ObjectTypesOf<S>;

type EndpointObjectTypesOf<S extends Shape, M extends MorphismType, E> = E extends ObType
    ? MatchingObjectTypesOf<ObjectTypesOf<S>, E>
    : E extends { readonly obType: infer O }
      ? MatchingObjectTypesOf<ObjectTypesOf<S>, O>
      : HomObjectTypesOf<S, M>;

export type DomainObjectTypesOf<S extends Shape, M extends MorphismType> = M extends {
    readonly endpoints: { readonly domain: infer E };
}
    ? EndpointObjectTypesOf<S, M, E>
    : HomObjectTypesOf<S, M>;

export type CodomainObjectTypesOf<S extends Shape, M extends MorphismType> = M extends {
    readonly endpoints: { readonly codomain: infer E };
}
    ? EndpointObjectTypesOf<S, M, E>
    : HomObjectTypesOf<S, M>;

export type ListModality = Extract<Modality, `${string}List`>;

export type MorphismEndpointValue<
    M extends MorphismType,
    Side extends keyof MorphismEndpoints,
    Value,
> = M extends {
    readonly endpoints: {
        readonly [K in Side]: { readonly modality: ListModality };
    };
}
    ? readonly (Value | null)[]
    : Value;

export function findObjectType<S extends Shape>(
    shape: S,
    obType: ObType,
): ObjectTypesOf<S> | undefined {
    return Object.values(shape.objects ?? {}).find((type) =>
        objectTypesEqual(type.obType, obType),
    ) as ObjectTypesOf<S> | undefined;
}

export function findMorphismType<S extends Shape>(
    shape: S,
    morType: DeepReadonly<MorType>,
): MorphismTypesOf<S> | undefined {
    return Object.values(shape.morphisms ?? {}).find((type) =>
        morphismTypesEqual(type.morType, morType),
    ) as MorphismTypesOf<S> | undefined;
}
