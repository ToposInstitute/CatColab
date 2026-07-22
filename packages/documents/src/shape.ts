import { deepEqual } from "fast-equals";

import type { Modality, MorType, ObOp, ObType } from "catcolab-document-types";

export interface ObjectType<T extends ObType = ObType> {
    readonly kind: "object";
    readonly obType: T;
}

export interface MorphismType<T extends MorType = MorType> {
    readonly kind: "morphism";
    readonly morType: T;
}

export const RichText = { kind: "rich-text" } as const;

export interface Shape {
    readonly theory?: string;
    readonly objects?: readonly ObjectType[];
    readonly morphisms?: readonly MorphismType[];
    readonly informal?: readonly RichTextType[];
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

export function defineObject<const T>(obType: T & ObType): ObjectType<T & ObType> {
    return { kind: "object", obType };
}

export function defineMorphism<const T>(morType: T & MorType): MorphismType<T & MorType>;
export function defineMorphism<const T, const E extends MorphismEndpoints>(
    morType: T & MorType,
    endpoints: E,
): MorphismType<T & MorType> & { readonly endpoints: E };
export function defineMorphism<const T, const E extends MorphismEndpoints>(
    morType: T & MorType,
    endpoints?: E,
): MorphismType<T & MorType> | (MorphismType<T & MorType> & { readonly endpoints: E }) {
    return endpoints ? { kind: "morphism", morType, endpoints } : { kind: "morphism", morType };
}

export function defineShape<const S extends Shape>(shape: S): S {
    return shape;
}

export type RichTextType = typeof RichText;
export type ObjectTypes<S extends Shape> = NonNullable<S["objects"]>[number];
export type MorphismTypes<S extends Shape> = NonNullable<S["morphisms"]>[number];
export type CellType<S extends Shape> = RichTextType | ObjectTypes<S> | MorphismTypes<S>;

type MatchingObjectType<O, Required> = O extends ObjectType
    ? O["obType"] extends Required
        ? Required extends O["obType"]
            ? O
            : never
        : never
    : never;

export type EndpointObjectTypes<S extends Shape, T extends MorphismType> = T["morType"] extends {
    tag: "Hom";
    content: infer Required;
}
    ? MatchingObjectType<ObjectTypes<S>, Required>
    : ObjectTypes<S>;

export function findObjectType<S extends Shape>(
    shape: S,
    obType: ObType,
): ObjectTypes<S> | undefined {
    return shape.objects?.find((type) => deepEqual(type.obType, obType)) as
        | ObjectTypes<S>
        | undefined;
}

export function findMorphismType<S extends Shape>(
    shape: S,
    morType: MorType,
): MorphismTypes<S> | undefined {
    return shape.morphisms?.find((type) => deepEqual(type.morType, morType)) as
        | MorphismTypes<S>
        | undefined;
}
