import type { MorType, ObType } from "catcolab-document-types";
import { type ModelDocument, newModelDocument, newMorphismDecl, newObjectDecl } from "./model";
import { appendCell, newFormalCell, newRichTextCell } from "./notebook";

/**
 * Minimal structural type matching the call shapes of Solid's
 * `SetStoreFunction` that we actually use. Declared locally so this package
 * does not need a runtime dependency on `solid-js`.
 */
// Loose callable that accepts Solid's SetStoreFunction without taking
// `solid-js` as a runtime dependency.
type StoreSetter = (...args: unknown[]) => void;

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
    name: string;
    /**
     * Bind a Solid store setter so that subsequent mutations
     * (`update`, cell `update`, cell creation) are routed through the setter,
     * making them observable to Solid reactivity.
     */
    bind(setter: StoreSetter): void;
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

    let setter: StoreSetter | null = null;

    // The api object owns the document's state as its own writable properties
    // so a wrapping Solid store can intercept reads/writes on `name`,
    // `notebook`, etc. Methods are added alongside the data.
    const state = document as ModelDocument & Record<string, unknown>;

    const appendCellViaStore = <T>(cell: { id: string } & T) => {
        if (setter) {
            setter("notebook", "cellContents", cell.id, cell);
            setter("notebook", "cellOrder", (order: unknown) => [...(order as string[]), cell.id]);
        } else {
            appendCell(state.notebook, cell as unknown as Parameters<typeof appendCell>[1]);
        }
    };

    const methods = {
        bind(s: StoreSetter) {
            setter = s;
        },
        update(updateArgs: Partial<{ name: string }>) {
            if (setter) {
                setter(updateArgs);
            } else {
                Object.assign(state, updateArgs);
            }
        },
        richText(cellArgs: { content: string }) {
            const cell = newRichTextCell(cellArgs.content);
            appendCellViaStore(cell);

            return {
                id: cell.id,
                update(updateArgs: Partial<{ content: string }>) {
                    if (setter) {
                        setter("notebook", "cellContents", cell.id, updateArgs);
                    } else {
                        Object.assign(cell, updateArgs);
                    }
                },
            };
        },
        object<TType extends LogicObjectType<TLogic> = LogicObjectType<TLogic>>(
            type: TType,
            objectArgs: { name: string },
        ) {
            const judgment = newObjectDecl(type);
            judgment.name = objectArgs.name;
            const formalCell = newFormalCell(judgment);
            appendCellViaStore(formalCell);

            return {
                id: judgment.id,
                type,
                update(updateArgs: Partial<{ name: string }>) {
                    if (setter) {
                        setter("notebook", "cellContents", formalCell.id, "content", updateArgs);
                    } else {
                        Object.assign(judgment, updateArgs);
                    }
                },
            };
        },
        morphism<TType extends LogicMorphismType<TLogic> = LogicMorphismType<TLogic>>(
            type: TType,
            morphismArgs: MorphismArgs<TType>,
        ) {
            const judgment = newMorphismDecl(type);
            judgment.name = morphismArgs.name;
            const formalCell = newFormalCell(judgment);
            appendCellViaStore(formalCell);

            return {
                id: judgment.id,
                type,
                update(updateArgs: Partial<MorphismArgs<TType>>) {
                    if (setter) {
                        setter("notebook", "cellContents", formalCell.id, "content", updateArgs);
                    } else {
                        Object.assign(judgment, updateArgs);
                    }
                },
            };
        },
    };

    // Merge state and methods so the returned object owns `name`, `notebook`,
    // etc. as plain writable properties. A wrapping Solid store can then
    // observe reads and route writes via `setter`.
    const api = Object.assign(state, methods);

    return api as unknown as ModelNotebook<TLogic>;
}

export const ModelNotebook = {
    create<TLogic extends AnyModelLogic>(logic: TLogic, args: { name: string }) {
        return createNotebook<TLogic>(logic, args);
    },
};
