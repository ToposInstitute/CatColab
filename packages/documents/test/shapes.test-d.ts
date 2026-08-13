import { SimpleOlog } from "catcolab-logics/simple-olog";
import { SimpleSchema } from "catcolab-logics/simple-schema";
import { describe, test } from "vitest";

// RFC-0006 "Generic shapes of notebooks" (type-level behaviour).
//
// With a union of shapes passed to `Notebook`, adding cells requires narrowing
// with `supports`; structurally incompatible notebooks are rejected by the
// compiler. These cases are checked by the compiler only (vitest typecheck
// mode); nothing here executes. The runtime counterparts live in
// shapes.test.ts.
import {
    createBinder,
    defineMorphism,
    defineObject,
    defineShape,
    type Notebook,
} from "catcolab-documents";

const BasicObj = defineObject({ tag: "Basic", content: "Object" });

const OnlyBasicObj = defineShape({
    objects: [BasicObj],
});

const EntityObj = defineObject({ tag: "Basic", content: "Entity" });
const OnlyEntityObj = defineShape({
    objects: [EntityObj],
});

const Morphism = defineMorphism({
    tag: "Hom",
    content: EntityObj.obType,
});
const EntityWithMor = defineShape({
    objects: [EntityObj],
    morphisms: [Morphism],
});

const tensor = { tag: "Basic", content: "tensor" } as const;

const ListMor = defineMorphism(
    { tag: "Hom", content: BasicObj.obType },
    {
        domain: { apply: tensor, modality: "List" },
        codomain: { apply: tensor, modality: "List" },
    },
);
const ListShape = defineShape({
    objects: [BasicObj],
    morphisms: [ListMor],
});

const SymmetricListMor = defineMorphism(
    { tag: "Hom", content: BasicObj.obType },
    {
        domain: { apply: tensor, modality: "SymmetricList" },
        codomain: { apply: tensor, modality: "SymmetricList" },
    },
);
const SymmetricListShape = defineShape({
    objects: [BasicObj],
    morphisms: [SymmetricListMor],
});

const CocartesianListMor = defineMorphism(
    { tag: "Hom", content: BasicObj.obType },
    {
        domain: { apply: tensor, modality: "CocartesianList" },
        codomain: { apply: tensor, modality: "CocartesianList" },
    },
);
const CocartesianListShape = defineShape({
    objects: [BasicObj],
    morphisms: [CocartesianListMor],
});

const CartesianListMor = defineMorphism(
    { tag: "Hom", content: BasicObj.obType },
    {
        domain: { apply: tensor, modality: "CartesianList" },
        codomain: { apply: tensor, modality: "CartesianList" },
    },
);
const CartesianListShape = defineShape({
    objects: [BasicObj],
    morphisms: [CartesianListMor],
});

const AdditiveListMor = defineMorphism(
    { tag: "Hom", content: BasicObj.obType },
    {
        domain: { apply: tensor, modality: "AdditiveList" },
        codomain: { apply: tensor, modality: "AdditiveList" },
    },
);
const AdditiveListShape = defineShape({
    objects: [BasicObj],
    morphisms: [AdditiveListMor],
});

type NotebookOfLists = Notebook<
    | typeof ListShape
    | typeof SymmetricListShape
    | typeof CocartesianListShape
    | typeof CartesianListShape
    | typeof AdditiveListShape
>;

/** A stand-in value for the compiler; this file is typechecked, never run. */
function typeOnly<T>(): T {
    throw new Error("type-level only");
}

describe("generic shapes (type level)", () => {
    test("a notebook lacking a shape's objects is rejected", async () => {
        const binder = createBinder();

        function addObjects(notebook: Notebook<typeof OnlyBasicObj>) {
            notebook.add(BasicObj, { label: "A" });
            notebook.add(BasicObj, { label: "B" });
        }

        const olog = await binder.createNotebook(SimpleOlog, { title: "olog" });
        addObjects(olog);

        // A schema notebook has no basic `Object` so we get a type error.
        const schema = await binder.createNotebook(SimpleSchema, { title: "schema" });

        // @ts-expect-error A SimpleSchema notebook lacks the basic `Object` that OnlyBasicObj requires.
        addObjects(schema);
    });

    test("a union of shapes requires narrowing with supports before adding", () => {
        function addBasicAndEntityObjects(
            notebook: Notebook<typeof OnlyBasicObj | typeof OnlyEntityObj>,
        ) {
            // @ts-expect-error We can't add a BasicObj without narrowing the notebook
            // type because OnlyEntityObj does not support BasicObj.
            notebook.add(BasicObj, { label: "A" });

            // This is ok because we narrowed the notebook type.
            if (notebook.supports(BasicObj)) {
                notebook.add(BasicObj, { label: "B" });
            }

            // @ts-expect-error We can't add an EntityObj without narrowing the notebook
            // type because OnlyBasicObj does not support EntityObj.
            notebook.add(EntityObj, { label: "C" });

            // This is ok because we narrowed the notebook type.
            if (notebook.supports(EntityObj)) {
                notebook.add(EntityObj, { label: "D" });
            }
        }

        const notebook = typeOnly<Notebook<typeof OnlyBasicObj | typeof OnlyEntityObj>>();
        addBasicAndEntityObjects(notebook);
    });

    test("supports can also take a shape as an argument", () => {
        function addBasicEntityAndMor(
            notebook: Notebook<typeof OnlyBasicObj | typeof EntityWithMor>,
        ) {
            // @ts-expect-error We can't add a BasicObj without narrowing the notebook
            // type because EntityWithMor does not support BasicObj.
            notebook.add(BasicObj, { label: "A" });

            // This is ok because we narrowed the notebook type.
            if (notebook.supports(OnlyBasicObj)) {
                notebook.add(BasicObj, { label: "B" });
            }

            // @ts-expect-error We can't add an EntityObj without narrowing the notebook
            // type because OnlyBasicObj does not support EntityObj.
            notebook.add(EntityObj, { label: "C" });

            // This is ok because we narrowed the notebook type to supporting both
            // `EntityObj` and `Morphism`.
            if (notebook.supports(EntityWithMor)) {
                const d = notebook.add(EntityObj, { label: "D" });
                notebook.add(Morphism, { label: "f", from: d, to: d });
            }
        }

        const notebook = typeOnly<Notebook<typeof OnlyBasicObj | typeof EntityWithMor>>();
        addBasicEntityAndMor(notebook);
    });

    test("adding a list morphism to a union of list shapes requires narrowing", () => {
        function badAddListMorphism(notebook: NotebookOfLists) {
            const a = notebook.add(BasicObj, { label: "A" });
            const b = notebook.add(BasicObj, { label: "B" });
            const c = notebook.add(BasicObj, { label: "C" });

            // @ts-expect-error Not all variants support adding a `ListMor`. You need to narrow the type using the `supports` method.
            notebook.add(ListMor, { label: "L", from: [a, b], to: [c] });
        }

        const notebook = typeOnly<NotebookOfLists>();
        badAddListMorphism(notebook);
    });

    test("structurally incompatible notebooks are rejected", async () => {
        const binder = createBinder();

        const addListMorphism = typeOnly<(notebook: NotebookOfLists) => void>();

        const simpleOlog = await binder.createNotebook(SimpleOlog, { title: "example" });

        // @ts-expect-error A SimpleOlog notebook lacks the list-valued morphisms ListShape requires.
        addListMorphism(simpleOlog);

        const JustObjectShape = defineShape({
            theory: "just-objects",
            objects: [BasicObj],
        });

        const justObjects = await binder.createNotebook(JustObjectShape, { title: "example" });

        // @ts-expect-error We have no morphisms in `JustObjectShape`.
        addListMorphism(justObjects);

        const JustMorphismShape = defineShape({
            theory: "just-morphisms",
            morphisms: [ListMor],
        });

        const justMorphisms = await binder.createNotebook(JustMorphismShape, {
            title: "example",
        });

        // @ts-expect-error We have no objects in `JustMorphismShape`.
        addListMorphism(justMorphisms);
    });

    test("morphisms only accept endpoints of their own object type", () => {
        const EntityListMor = defineMorphism(
            { tag: "Hom", content: EntityObj.obType },
            {
                domain: { apply: tensor, modality: "List" },
                codomain: { apply: tensor, modality: "List" },
            },
        );

        const MultiObjectListShape = defineShape({
            objects: [BasicObj, EntityObj],
            morphisms: [ListMor, EntityListMor],
        });

        function badAddListMorphism2(notebook: Notebook<typeof MultiObjectListShape>) {
            const a = notebook.add(BasicObj, { label: "A" });
            const b = notebook.add(BasicObj, { label: "B" });
            const e = notebook.add(EntityObj, { label: "E" });

            notebook.add(ListMor, { label: "L1", from: [a, b], to: [b] });
            // @ts-expect-error We can't use an EntityObj with a ListMor
            notebook.add(ListMor, { label: "L2", from: [a, b], to: [e] });
        }

        const notebook = typeOnly<Notebook<typeof MultiObjectListShape>>();
        badAddListMorphism2(notebook);
    });

    test("narrowing objects across unions of shapes", () => {
        const EntityListMor = defineMorphism(
            { tag: "Hom", content: EntityObj.obType },
            {
                domain: { apply: tensor, modality: "List" },
                codomain: { apply: tensor, modality: "List" },
            },
        );

        const EntityObjectListShape = defineShape({
            objects: [EntityObj],
            morphisms: [EntityListMor],
        });

        type NotebookOfListsWithEntity = Notebook<
            | typeof ListShape
            | typeof SymmetricListShape
            | typeof CocartesianListShape
            | typeof CartesianListShape
            | typeof AdditiveListShape
            | typeof EntityObjectListShape
        >;

        function goodAddObject(notebook: NotebookOfListsWithEntity) {
            if (notebook.supports(BasicObj)) {
                notebook.add(BasicObj, { label: "A" });
            }

            if (notebook.supports(EntityObj)) {
                notebook.add(EntityObj, { label: "E" });
            }
        }

        const BothObjectsShape = defineShape({
            objects: [BasicObj, EntityObj],
        });

        function goodAddObject2(notebook: NotebookOfListsWithEntity) {
            if (notebook.supports(BothObjectsShape)) {
                notebook.add(BasicObj, { label: "A" });
                notebook.add(EntityObj, { label: "E" });
            }
        }

        type JustEntityObjectListShape = Notebook<typeof EntityObjectListShape>;

        function goodAddObject3(notebook: JustEntityObjectListShape) {
            notebook.add(EntityObj, { label: "E" });
        }

        function badAddObject(notebook: NotebookOfListsWithEntity) {
            // @ts-expect-error We can't add a BasicObj without narrowing the notebook type because EntityObjectListShape does not support BasicObj.
            notebook.add(BasicObj, { label: "A" });

            // @ts-expect-error We can't add an EntityObj without narrowing the notebook type because not all notebooks support EntityObj.
            notebook.add(EntityObj, { label: "E" });
        }

        function badAddObject2(notebook: Notebook<typeof BothObjectsShape>) {
            const a = notebook.add(BasicObj, { label: "A" });
            const b = notebook.add(BasicObj, { label: "B" });

            // @ts-expect-error BothObjectsShape can never support CocartesianListMor.
            if (notebook.supports(CocartesianListMor)) {
                // @ts-expect-error BothObjectsShape does not support CocartesianListMor.
                notebook.add(CocartesianListMor, { label: "L", from: [a, b], to: [b] });
            }
        }

        const notebookOfLists = typeOnly<NotebookOfListsWithEntity>();
        goodAddObject(notebookOfLists);
        goodAddObject2(notebookOfLists);
        badAddObject(notebookOfLists);

        const entityNotebook = typeOnly<JustEntityObjectListShape>();
        goodAddObject3(entityNotebook);

        const bothNotebook = typeOnly<Notebook<typeof BothObjectsShape>>();
        badAddObject2(bothNotebook);
    });

    test("instance table objects must be declared objects", () => {
        defineShape({
            theory: "valid-instance-shape",
            getCoreTheory: SimpleSchema.getCoreTheory,
            objects: [BasicObj, EntityObj],
            supportsInstances: {
                tableObjects: [EntityObj],
            },
        });

        // @ts-expect-error EntityObj is not declared in the shape's objects list.
        defineShape({
            theory: "invalid-instance-shape",
            getCoreTheory: SimpleSchema.getCoreTheory,
            objects: [BasicObj],
            supportsInstances: {
                tableObjects: [EntityObj],
            },
        });

        // @ts-expect-error Table objects require a declared objects list.
        defineShape({
            theory: "missing-instance-objects",
            getCoreTheory: SimpleSchema.getCoreTheory,
            supportsInstances: {
                tableObjects: [EntityObj],
            },
        });

        // @ts-expect-error Instance support requires a theory.
        defineShape({
            getCoreTheory: SimpleSchema.getCoreTheory,
            objects: [EntityObj],
            supportsInstances: { tableObjects: [EntityObj] },
        });

        // @ts-expect-error Instance support requires a core theory loader.
        defineShape({
            theory: "missing-instance-core-theory",
            objects: [EntityObj],
            supportsInstances: { tableObjects: [EntityObj] },
        });
    });
});
