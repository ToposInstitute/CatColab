import type { Modality, MorType, ObOp, ObType } from "catcolab-document-types";
import type { DblTheory } from "catlog-wasm";
import { morphismTypesEqual, objectTypesEqual } from "./model/equality";

export interface ObjectType<O extends ObType = ObType> {
    readonly kind: "object";
    readonly obType: O;
}

export interface MorphismType<M extends MorType = MorType> {
    readonly kind: "morphism";
    readonly morType: M;
}

export const RichText = { kind: "rich-text" } as const;

export interface Shape {
    readonly theory?: string;
    readonly getCoreTheory?: () => Promise<DblTheory>;
    readonly objects?: readonly ObjectType[];
    readonly morphisms?: readonly MorphismType[];
    readonly informal?: readonly RichTextType[];
    readonly supportsInstances?: {
        readonly tableObjects: readonly ObjectType[];
    };
}

export type MorphismEndpoint =
    | ObType
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

export function defineShape<const S extends Shape>(shape: S): S {
    if (shape.supportsInstances) {
        if (!shape.theory || !shape.getCoreTheory) {
            throw new Error("An instance-capable shape must define a theory and its core theory");
        }
        if (
            shape.supportsInstances.tableObjects.some(
                (tableObject) => !shape.objects?.includes(tableObject),
            )
        ) {
            throw new Error("Instance table objects must be declared in the shape's objects");
        }
    }
    return shape;
}

/** A shape that declares support for tabular instances of its models. */
export type InstanceCapableShape = Shape & {
    readonly supportsInstances: {
        readonly tableObjects: readonly ObjectType[];
    };
};

export type RichTextType = typeof RichText;
export type ObjectTypesOf<S extends Shape> = NonNullable<S["objects"]>[number];
export type MorphismTypesOf<S extends Shape> = NonNullable<S["morphisms"]>[number];
export type AnyCellType = RichTextType | ObjectType | MorphismType;
export type CellTypeOf<S extends Shape> = RichTextType | ObjectTypesOf<S> | MorphismTypesOf<S>;

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

export function findObjectType<S extends Shape>(
    shape: S,
    obType: ObType,
): ObjectTypesOf<S> | undefined {
    return shape.objects?.find((type) => objectTypesEqual(type.obType, obType)) as
        | ObjectTypesOf<S>
        | undefined;
}

export function findMorphismType<S extends Shape>(
    shape: S,
    morType: MorType,
): MorphismTypesOf<S> | undefined {
    return shape.morphisms?.find((type) => morphismTypesEqual(type.morType, morType)) as
        | MorphismTypesOf<S>
        | undefined;
}
