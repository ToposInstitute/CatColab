import type { MorType, ObType } from "catcolab-document-types";
import { newModelDocument, newMorphismDecl, newObjectDecl } from "./model";
import { appendCell, newFormalCell, newRichTextCell } from "./notebook";

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
};

export type RichTextCell = Update<{ content: string }> & {
    readonly id: string;
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

type LogicTheory<TLogic extends AnyModelLogic> =
    TLogic extends ModelLogic<
        infer Theory,
        Record<string, ObjectType<string>>,
        Record<string, MorphismType<unknown, string>>
    >
        ? Theory
        : never;

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

function createNotebook<TLogic extends AnyModelLogic>(
    logic: TLogic,
    args: { name: string },
): ModelNotebook<TLogic> {
    const document = newModelDocument({ theory: logic.theory as LogicTheory<TLogic> });
    document.name = args.name;

    const api = {
        update(updateArgs: Partial<{ name: string }>) {
            Object.assign(document, updateArgs);
        },
        richText(cellArgs: { content: string }) {
            const cell = newRichTextCell(cellArgs.content);
            appendCell(document.notebook, cell);

            return {
                id: cell.id,
                update(updateArgs: Partial<{ content: string }>) {
                    Object.assign(cell, updateArgs);
                },
            };
        },
        object<TType extends LogicObjectType<TLogic> = LogicObjectType<TLogic>>(
            type: TType,
            objectArgs: { name: string },
        ) {
            const judgment = newObjectDecl(type);
            judgment.name = objectArgs.name;
            appendCell(document.notebook, newFormalCell(judgment));

            return {
                id: judgment.id,
                type,
                update(updateArgs: Partial<{ name: string }>) {
                    Object.assign(judgment, updateArgs);
                },
            };
        },
        morphism<TType extends LogicMorphismType<TLogic> = LogicMorphismType<TLogic>>(
            type: TType,
            morphismArgs: MorphismArgs<TType>,
        ) {
            const judgment = newMorphismDecl(type);
            judgment.name = morphismArgs.name;
            appendCell(document.notebook, newFormalCell(judgment));

            return {
                id: judgment.id,
                type,
                update(updateArgs: Partial<MorphismArgs<TType>>) {
                    Object.assign(judgment, updateArgs);
                },
            };
        },
    };

    return api as ModelNotebook<TLogic>;
}

export const ModelNotebook = {
    create<TLogic extends AnyModelLogic>(logic: TLogic, args: { name: string }) {
        return createNotebook<TLogic>(logic, args);
    },
};
