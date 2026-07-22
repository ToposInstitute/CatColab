import { deepEqual } from "fast-equals";

import type { MorType, ObType } from "catcolab-document-types";

export interface ObjectType {
    readonly kind: "object";
    readonly obType: ObType;
}

export interface MorphismType {
    readonly kind: "morphism";
    readonly morType: MorType;
}

export const RichText = { kind: "rich-text" } as const;

export interface Shape {
    readonly theory: string;
    readonly objects?: readonly ObjectType[];
    readonly morphisms?: readonly MorphismType[];
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
