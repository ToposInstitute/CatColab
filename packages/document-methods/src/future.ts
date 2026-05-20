import type { MorType, ObType } from "catcolab-document-types";
import { appendCell, newFormalCell, newRichTextCell } from "./notebook";
import { newModelDocument, newMorphismDecl, newObjectDecl } from "./model";

type ObjectType<Name extends string> = ObType & { readonly objectTypeName?: Name };
type MorphismType<Endpoint, Name extends string> = MorType & {
    readonly morphismTypeName?: Name;
    readonly endpoint?: Endpoint;
};

type Update<T> = {
    update(args: Partial<T>): void;
};

type ObjectCell<TType extends ObjectType<string>> = Update<{ name: string }> & {
    readonly id: string;
    readonly type: TType;
};

type EndpointOf<TType> = TType extends MorphismType<infer Endpoint, string> ? Endpoint : never;

type MorphismArgs<TType extends MorphismType<unknown, string>> = {
    name: string;
    dom: EndpointOf<TType>;
    cod: EndpointOf<TType>;
};

type MorphismCell<TType extends MorphismType<unknown, string>> = Update<MorphismArgs<TType>> & {
    readonly id: string;
    readonly type: TType;
};

type RichTextCell = Update<{ content: string }> & {
    readonly id: string;
};

type NotebookApi<TObjectType extends ObjectType<string>, TMorphismType extends MorphismType<unknown, string>> =
    Update<{ name: string }> & {
        richText(args: { content: string }): RichTextCell;
        object<TType extends TObjectType>(type: TType, args: { name: string }): ObjectCell<TType>;
        morphism<TType extends TMorphismType>(
            type: TType,
            args: MorphismArgs<TType>,
        ): MorphismCell<TType>;
    };

const objectType = <Name extends string>(content: string) =>
    ({ tag: "Basic", content }) as ObjectType<Name>;

const morphismType = <Endpoint, Name extends string>() =>
    ({ tag: "Hom", content: { tag: "Basic", content: "Object" } }) as MorphismType<Endpoint, Name>;

function createNotebook<TObjectType extends ObjectType<string>, TMorphismType extends MorphismType<unknown, string>>(
    theory: string,
    args: { name: string },
): NotebookApi<TObjectType, TMorphismType> {
    const document = newModelDocument({ theory });
    document.name = args.name;

    return {
        update(updateArgs) {
            Object.assign(document, updateArgs);
        },
        richText(cellArgs) {
            const cell = newRichTextCell(cellArgs.content);
            appendCell(document.notebook, cell);

            return {
                id: cell.id,
                update(updateArgs) {
                    Object.assign(cell, updateArgs);
                },
            };
        },
        object(type, objectArgs) {
            const judgment = newObjectDecl(type);
            judgment.name = objectArgs.name;
            appendCell(document.notebook, newFormalCell(judgment));

            return {
                id: judgment.id,
                type,
                update(updateArgs) {
                    Object.assign(judgment, updateArgs);
                },
            };
        },
        morphism(type, morphismArgs) {
            const judgment = newMorphismDecl(type);
            judgment.name = morphismArgs.name;
            appendCell(document.notebook, newFormalCell(judgment));

            return {
                id: judgment.id,
                type,
                update(updateArgs) {
                    Object.assign(judgment, updateArgs);
                },
            };
        },
    };
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
