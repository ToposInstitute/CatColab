import { PetriNet } from "catcolab-logics/petri-net";
import { SimpleOlog } from "catcolab-logics/simple-olog";
import { Attr, AttrType, Entity, Mapping, SimpleSchema } from "catcolab-logics/simple-schema";
import { describe, expect, test } from "vitest";

// RFC-0006 "Generic shapes of notebooks" (runtime behaviour).
//
// Using `defineShape` we don't have to define a complete notebook: shapes can
// be subsets of a notebook and/or span across different notebooks. Generic
// consumers narrow what a notebook actually supports with `supports`, and
// `cellsOf` also accepts a `Shape` to filter by. The type-level counterparts
// live in shapes.test-d.ts.
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

/**
 * Works on any notebook that supports any of the morphisms our list shapes
 * support; returns which list morphism variant was added.
 */
function addListMorphism(notebook: NotebookOfLists): string {
    const a = notebook.add(BasicObj, { label: "A" });
    const b = notebook.add(BasicObj, { label: "B" });
    const c = notebook.add(BasicObj, { label: "C" });

    if (notebook.supports(ListMor)) {
        notebook.add(ListMor, { label: "L", from: [a, b], to: [c] });
        return "ListMor";
    } else if (notebook.supports(SymmetricListMor)) {
        notebook.add(SymmetricListMor, { label: "L", from: [a, b], to: [c] });
        return "SymmetricListMor";
    } else if (notebook.supports(CocartesianListMor)) {
        notebook.add(CocartesianListMor, { label: "L", from: [a, b], to: [c] });
        return "CocartesianListMor";
    } else if (notebook.supports(CartesianListMor)) {
        notebook.add(CartesianListMor, { label: "L", from: [a, b], to: [c] });
        return "CartesianListMor";
    } else if (notebook.supports(AdditiveListMor)) {
        notebook.add(AdditiveListMor, { label: "L", from: [a, b], to: [c] });
        return "AdditiveListMor";
    }
    // If the code type checked this should be unreachable.
    throw new Error("Did not find any supported List morphism in the notebook.");
}

describe.skip("generic shapes of notebooks", () => {
    test("a generic function against a subset shape works with notebooks from either logic", async () => {
        const binder = createBinder();

        function addObjects(notebook: Notebook<typeof OnlyBasicObj>) {
            notebook.add(BasicObj, { label: "A" });
            notebook.add(BasicObj, { label: "B" });
        }

        // Both an olog and a petri-net notebook support `BasicObj` (they share
        // the basic `Object`).
        const olog = await binder.createNotebook(SimpleOlog, { title: "olog" });
        const petriNet = await binder.createNotebook(PetriNet, { title: "petri-net" });

        addObjects(olog);
        addObjects(petriNet);

        expect(olog.cellsOf(BasicObj).map((cell) => cell.label)).toEqual(["A", "B"]);
        expect(petriNet.cellsOf(BasicObj).map((cell) => cell.label)).toEqual(["A", "B"]);
    });

    test("supports narrows what a notebook accepts at runtime", async () => {
        const binder = createBinder();

        const EntityObj = defineObject({ tag: "Basic", content: "Entity" });
        const OnlyEntityObj = defineShape({
            objects: [EntityObj],
        });

        // On a union of shapes, `supports` reports what the notebook actually
        // accepts; it can take a cell definition or a shape as an argument.
        function probe(notebook: Notebook<typeof OnlyBasicObj | typeof OnlyEntityObj>) {
            return {
                basic: notebook.supports(BasicObj),
                entity: notebook.supports(EntityObj),
                basicShape: notebook.supports(OnlyBasicObj),
            };
        }

        const olog = await binder.createNotebook(SimpleOlog, { title: "olog" });
        const schema = await binder.createNotebook(SimpleSchema, { title: "schema" });

        expect(probe(olog)).toEqual({ basic: true, entity: false, basicShape: true });
        // A schema notebook has no basic `Object`.
        expect(probe(schema)).toEqual({ basic: false, entity: true, basicShape: false });
    });

    test("cellsOf also accepts a shape to filter by", async () => {
        const binder = createBinder();

        const EntityShape = defineShape({
            objects: [Entity],
            morphisms: [Mapping],
        });

        const schema = await binder.createNotebook(SimpleSchema, { title: "Example" });

        const a = schema.add(Entity, { label: "A" });
        const b = schema.add(AttrType, { label: "B" });
        const c = schema.add(Entity, { label: "C" });
        schema.add(Attr, { label: "f", from: a, to: b });
        schema.add(Mapping, { label: "g", from: a, to: c });

        const labels: (string | null | undefined)[] = [];
        for (const cell of schema.cellsOf(EntityShape)) {
            labels.push(cell.label);
        }
        expect(labels).toEqual(["A", "C", "g"]);
    });

    test("a structurally compatible notebook is accepted and the appropriate morphism is added", async () => {
        const binder = createBinder();

        const petriNet = await binder.createNotebook(PetriNet, { title: "example" });
        expect(addListMorphism(petriNet)).toBe("SymmetricListMor");

        const entityObType = defineObject({ tag: "Basic", content: "Entity" });
        const EntityObjectShape = defineShape({
            theory: "entity-objects",
            objects: [entityObType, BasicObj],
            morphisms: [ListMor],
        });

        const entityObjects = await binder.createNotebook(EntityObjectShape, {
            title: "example",
        });
        expect(addListMorphism(entityObjects)).toBe("ListMor");
    });
});
