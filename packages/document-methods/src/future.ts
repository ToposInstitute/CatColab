import type { MorType, ObType } from "catcolab-document-types";
import { appendCell, newFormalCell, newRichTextCell } from "./notebook";
import { newModelDocument, newMorphismDecl, newObjectDecl } from "./model";

type ObjectType<Name extends string> = ObType & { readonly objectTypeName?: Name };
type MorphismType<Endpoint, Name extends string> = MorType & {
    readonly morphismTypeName?: Name;
    readonly endpoint: (endpoint: Endpoint) => Endpoint;
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
    update<TArgs extends Partial<Record<keyof T, unknown>>>(args: TArgs & ValidateFields<T, TArgs>): void;
};

type ObjectCell<TType extends ObjectType<string>> = Update<{ name: string }> & {
    readonly id: string;
    readonly type: TType;
};

type EndpointOf<TType> = TType extends MorphismType<infer Endpoint, string> ? Endpoint : never;

type MorphismArgs<TType extends MorphismType<any, string>> = {
    name: string;
    dom: EndpointOf<TType>;
    cod: EndpointOf<TType>;
};

type MorphismCell<TType extends MorphismType<any, string>> = Update<MorphismArgs<TType>> & {
    readonly id: string;
    readonly type: TType;
};

type RichTextCell = Update<{ content: string }> & {
    readonly id: string;
};

type NotebookApi<TObjectType extends ObjectType<string>, TMorphismType extends MorphismType<any, string>> =
    Update<{ name: string }> & {
        richText(args: { content: string }): RichTextCell;
        object<TType extends TObjectType>(type: TType, args: { name: string }): ObjectCell<TType>;
        morphism<TDom, TCod>(
            type: TMorphismType,
            args: { name: string; dom: TDom; cod: TCod } &
                ValidateField<EndpointOf<TMorphismType>, TDom, "dom"> &
                ValidateField<EndpointOf<TMorphismType>, TCod, "cod">,
        ): MorphismCell<TMorphismType>;
    };

const objectType = <Name extends string>(content: string) =>
    ({ tag: "Basic", content }) as ObjectType<Name>;

const morphismType = <Endpoint, Name extends string>() =>
    ({ tag: "Hom", content: { tag: "Basic", content: "Object" } }) as MorphismType<Endpoint, Name>;

function createNotebook<TObjectType extends ObjectType<string>, TMorphismType extends MorphismType<any, string>>(
    theory: string,
    args: { name: string },
): NotebookApi<TObjectType, TMorphismType> {
    const document = newModelDocument({ theory });
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
        object<TType extends TObjectType>(type: TType, objectArgs: { name: string }) {
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
        morphism(type: TMorphismType, morphismArgs: MorphismArgs<TMorphismType>) {
            const judgment = newMorphismDecl(type);
            judgment.name = morphismArgs.name;
            appendCell(document.notebook, newFormalCell(judgment));

            return {
                id: judgment.id,
                type,
                update(updateArgs: Partial<MorphismArgs<TMorphismType>>) {
                    Object.assign(judgment, updateArgs);
                },
            };
        },
    };

    return api as NotebookApi<TObjectType, TMorphismType>;
}

const SimpleOlogType = objectType<"Type">("Object");
type SimpleOlogObject = ObjectCell<typeof SimpleOlogType>;
const SimpleOlogAspect = morphismType<SimpleOlogObject, "Aspect">();

export const SimpleOlog = {
    objectTypes: {
        Type: SimpleOlogType,
    },
    morphismTypes: {
        Aspect: SimpleOlogAspect,
    },
    create(args: { name: string }) {
        return createNotebook<typeof SimpleOlogType, typeof SimpleOlogAspect>("simple-olog", args);
    },
};

const PetriNetPlace = objectType<"Place">("Object");
type PetriNetPlaceObject = ObjectCell<typeof PetriNetPlace>;
const PetriNetTransition = morphismType<PetriNetPlaceObject[], "Transition">();

export const PetriNet = {
    objectTypes: {
        Place: PetriNetPlace,
    },
    morphismTypes: {
        Transition: PetriNetTransition,
    },
    create(args: { name: string }) {
        return createNotebook<typeof PetriNetPlace, typeof PetriNetTransition>("petri-net", args);
    },
};
