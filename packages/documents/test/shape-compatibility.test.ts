import { PetriNet, Place, Transition } from "catcolab-logics/petri-net";
import { Aspect, SimpleOlog, Type } from "catcolab-logics/simple-olog";
import { Entity, SimpleSchema } from "catcolab-logics/simple-schema";
import { describe, expect, expectTypeOf, test } from "vitest";

import {
    createBinder,
    defineMorphism,
    defineShape,
    type CellTypeVocabulary,
    type Instance,
    type Notebook,
} from "catcolab-documents";

const BasicRequirement = defineShape({ objects: { BasicObj: Type } });
const EntityRequirement = defineShape({ objects: { Entity } });
const AspectRequirement = defineShape({
    objects: { BasicObj: Type },
    morphisms: { Arrow: Aspect },
});

describe("shape vocabulary metadata", () => {
    test("generic notebooks accept equivalent cells with different names", async () => {
        function addObject(notebook: Notebook<typeof BasicRequirement>) {
            return notebook.add(Type, { label: "A" });
        }

        const binder = createBinder();
        const notebook = await binder.createNotebook(SimpleOlog, { title: "Olog" });
        try {
            expect(addObject(notebook).label).toBe("A");
            expectTypeOf<Notebook<typeof SimpleOlog>>().toExtend<
                Notebook<typeof AspectRequirement>
            >();
            expectTypeOf<Notebook<typeof PetriNet>>().toExtend<Notebook<typeof BasicRequirement>>();
            expectTypeOf<Notebook<typeof SimpleSchema>>().not.toExtend<
                Notebook<typeof BasicRequirement>
            >();
        } finally {
            notebook.dispose();
        }
    });

    test("notebooks retain their shape and share its generic vocabulary type", async () => {
        const binder = createBinder();
        const notebook = await binder.createNotebook(SimpleOlog, { title: "Olog" });
        try {
            expect(notebook.shape).toBe(SimpleOlog);
            expect(notebook.shape.cellTypes).toBe(SimpleOlog.cellTypes);
            expect(notebook.shape.cellTypes["Type"]).toBe(Type);
            expect(notebook.shape.cellTypes["Typo"]).toBeUndefined();
            expectTypeOf(notebook.shape).toEqualTypeOf<typeof SimpleOlog>();
            expectTypeOf(notebook.shape.cellTypes).toEqualTypeOf<CellTypeVocabulary>();
            expectTypeOf(SimpleOlog.cellTypes).toEqualTypeOf<CellTypeVocabulary>();
            expectTypeOf(notebook.shape.theory).toEqualTypeOf<"simple-olog">();
            expectTypeOf<(typeof notebook.shape.objects)[number]>().toEqualTypeOf<typeof Type>();
            expectTypeOf(notebook.shape.supportsInstances.tableObjects[0]).toEqualTypeOf<
                typeof Type
            >();
        } finally {
            notebook.dispose();
        }
    });

    test("instances ignore vocabulary aliases but preserve cell requirements", () => {
        expectTypeOf<Instance<typeof SimpleOlog>>().toExtend<Instance<typeof BasicRequirement>>();
        expectTypeOf<Instance<typeof SimpleSchema>>().not.toExtend<
            Instance<typeof BasicRequirement>
        >();
        expectTypeOf<
            Instance<typeof SimpleOlog>["shape"]["cellTypes"]
        >().toEqualTypeOf<CellTypeVocabulary>();
    });

    test("notebook shapes preserve unions and morphism endpoints", () => {
        type UnionShape = Notebook<typeof BasicRequirement | typeof EntityRequirement>["shape"];
        expectTypeOf<UnionShape>().toEqualTypeOf<
            typeof BasicRequirement | typeof EntityRequirement
        >();
        expectTypeOf<UnionShape["objects"][number]>().toEqualTypeOf<typeof Type | typeof Entity>();
        expectTypeOf<Notebook<typeof PetriNet>["shape"]["morphisms"][number]>().toEqualTypeOf<
            typeof Transition
        >();

        const SingleTransition = defineMorphism(Transition.morType, {
            domain: Place.obType,
            codomain: Place.obType,
        });
        const SingleRequirement = defineShape({ morphisms: { SingleTransition } });
        expectTypeOf<Notebook<typeof PetriNet>>().not.toExtend<
            Notebook<typeof SingleRequirement>
        >();
    });
});
