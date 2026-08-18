import { Aspect, SimpleOlog, Type } from "catcolab-logics/simple-olog";
import { Entity as SchemaEntity, SimpleSchema } from "catcolab-logics/simple-schema";
import { describe, expect, expectTypeOf, test } from "vitest";

import { defineMorphism, defineObject, defineShape } from "catcolab-documents";

describe("defining notebook shapes", () => {
    test("object and morphism definitions preserve their types and endpoint metadata", () => {
        const Entity = defineObject({ tag: "Basic", content: "Entity" });
        const AttrType = defineObject({ tag: "Basic", content: "AttrType" });
        const Attr = defineMorphism(
            { tag: "Basic", content: "Attr" },
            { domain: Entity.obType, codomain: AttrType.obType },
        );
        const Composite = defineMorphism({
            tag: "Composite",
            content: [{ tag: "Basic", content: "first" }],
        });
        const Tabulator = defineObject({ tag: "Tabulator", content: Composite.morType });
        const Transition = defineMorphism(
            { tag: "Hom", content: Entity.obType },
            {
                domain: {
                    apply: { tag: "Basic", content: "tensor" },
                    modality: "SymmetricList",
                },
                codomain: {
                    apply: { tag: "Basic", content: "tensor" },
                    modality: "SymmetricList",
                },
            },
        );

        expect(Entity).toEqual({
            kind: "object",
            obType: { tag: "Basic", content: "Entity" },
        });
        expect(Attr).toEqual({
            kind: "morphism",
            morType: { tag: "Basic", content: "Attr" },
            endpoints: {
                domain: Entity.obType,
                codomain: AttrType.obType,
            },
        });
        expectTypeOf(Entity.obType.content).toEqualTypeOf<"Entity">();
        expectTypeOf(Attr.endpoints.codomain).toEqualTypeOf<typeof AttrType.obType>();
        expectTypeOf(Composite.morType.content[0].content).toEqualTypeOf<"first">();
        expectTypeOf(Tabulator.obType.content.content[0].content).toEqualTypeOf<"first">();
        expectTypeOf(Transition.endpoints.domain.modality).toEqualTypeOf<"SymmetricList">();
    });

    test("shape definitions preserve complete and partial shape values", () => {
        const OnlyType = defineShape({ objects: [Type] });

        expect(OnlyType).toEqual({ objects: [Type] });
        expect(SimpleOlog).toEqual({
            theory: "simple-olog",
            getCoreTheory: expect.any(Function),
            objects: [Type],
            morphisms: [Aspect],
            supportsInstances: { tableObjects: [Type] },
        });
        expectTypeOf(SimpleOlog.theory).toEqualTypeOf<"simple-olog">();
    });

    test("instance-capable shapes select table objects declared by the shape", () => {
        expect(SimpleSchema.supportsInstances.tableObjects).toEqual([SchemaEntity]);

        expect(() =>
            // @ts-expect-error Instance support requires a theory and core theory.
            defineShape({
                objects: [SchemaEntity],
                supportsInstances: { tableObjects: [SchemaEntity] },
            }),
        ).toThrowError("An instance-capable shape must define a theory and its core theory");

        expect(() =>
            // @ts-expect-error Instance table objects must be declared by the shape.
            defineShape({
                theory: "invalid-instance-shape",
                getCoreTheory: SimpleSchema.getCoreTheory,
                objects: [Type],
                supportsInstances: { tableObjects: [SchemaEntity] },
            }),
        ).toThrowError("Instance table objects must be declared in the shape's objects");
    });
});
