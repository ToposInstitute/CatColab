import type { Modality, MorType, ObOp, ObType } from "catcolab-document-types";
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
    return shape;
}

export type RichTextType = typeof RichText;
export type ObjectTypes<S extends Shape> = NonNullable<S["objects"]>[number];
export type MorphismTypes<S extends Shape> = NonNullable<S["morphisms"]>[number];
export type CellType<S extends Shape> = RichTextType | ObjectTypes<S> | MorphismTypes<S>;

type ObjectTypesOver<O, EndpointObType> = O extends ObjectType
    ? O["obType"] extends EndpointObType
        ? EndpointObType extends O["obType"]
            ? O
            : never
        : never
    : never;

type HomObjectTypes<S extends Shape, M extends MorphismType> = M["morType"] extends {
    tag: "Hom";
    content: infer EndpointObType;
}
    ? ObjectTypesOver<ObjectTypes<S>, EndpointObType>
    : ObjectTypes<S>;

type ObjectTypesAtEndpoint<S extends Shape, M extends MorphismType, E> = E extends ObType
    ? ObjectTypesOver<ObjectTypes<S>, E>
    : HomObjectTypes<S, M>;

export type DomainObjectTypes<S extends Shape, M extends MorphismType> = M extends {
    readonly endpoints: { readonly domain: infer E };
}
    ? ObjectTypesAtEndpoint<S, M, E>
    : HomObjectTypes<S, M>;

export type CodomainObjectTypes<S extends Shape, M extends MorphismType> = M extends {
    readonly endpoints: { readonly codomain: infer E };
}
    ? ObjectTypesAtEndpoint<S, M, E>
    : HomObjectTypes<S, M>;

export function findObjectType<S extends Shape>(
    shape: S,
    obType: ObType,
): ObjectTypes<S> | undefined {
    return shape.objects?.find((type) => objectTypesEqual(type.obType, obType)) as
        | ObjectTypes<S>
        | undefined;
}

export function findMorphismType<S extends Shape>(
    shape: S,
    morType: MorType,
): MorphismTypes<S> | undefined {
    return shape.morphisms?.find((type) => morphismTypesEqual(type.morType, morType)) as
        | MorphismTypes<S>
        | undefined;
}
