import { Aspect, SimpleOlog, Type } from "catcolab-logics/simple-olog";
import { Entity as SchemaEntity, SimpleSchema } from "catcolab-logics/simple-schema";
import { describe, expect, expectTypeOf, test } from "vitest";

import {
    defineMorphism,
    defineObject,
    defineShape,
    PathEquation,
    RichText,
    type CellTypeVocabulary,
    type ShapeDefinition,
} from "catcolab-documents";

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
        const OnlyType = defineShape({ objects: { Type } });

        expect(OnlyType).toEqual({ objects: [Type], cellTypes: { Type } });
        expect(OnlyType.objects[0]).toBe(Type);
        expect(OnlyType.cellTypes["Type"]).toBe(Type);
        expectTypeOf(OnlyType.cellTypes).toEqualTypeOf<CellTypeVocabulary>();
        expectTypeOf<(typeof OnlyType.objects)[number]>().toEqualTypeOf<typeof Type>();
        expect(SimpleOlog).toEqual({
            theory: "simple-olog",
            getCoreTheory: expect.any(Function),
            objects: [Type],
            morphisms: [Aspect],
            informal: [RichText],
            supportsEquations: true,
            supportsInstances: { tableObjects: [Type] },
            cellTypes: { Type, Aspect, RichText, PathEquation },
        });
        expectTypeOf(SimpleOlog.theory).toEqualTypeOf<"simple-olog">();
    });

    test("partial shapes only expose their declared cells", () => {
        expect(defineShape({})).toEqual({ cellTypes: {} });
        expect(defineShape({ theory: "bare" })).toEqual({ theory: "bare", cellTypes: {} });
        expect(defineShape({ objects: {}, morphisms: {}, informal: {} })).toEqual({
            objects: [],
            morphisms: [],
            informal: [],
            cellTypes: {},
        });
        expect(defineShape({ informal: { RichText } }).cellTypes["RichText"]).toBe(RichText);
        expect(defineShape({ supportsEquations: true }).cellTypes["PathEquation"]).toBe(
            PathEquation,
        );
        expect(defineShape({ supportsEquations: false }).cellTypes).toEqual({});
        expect(defineShape({ objects: { Type } }).cellTypes).not.toHaveProperty("RichText");
    });

    test("named declarations preserve order, reference identity, and endpoint types", () => {
        const Other = defineObject({ tag: "Basic", content: "Other" });
        const Link = defineMorphism(
            { tag: "Basic", content: "Link" },
            { domain: Type.obType, codomain: Other.obType },
        );
        const shape = defineShape({
            objects: { Other, Type },
            morphisms: { Link },
            informal: { RichText },
        });
        expect(shape.objects).toEqual([Other, Type]);
        expect(shape.objects[0]).toBe(Other);
        expect(shape.objects[1]).toBe(Type);
        expect(shape.morphisms[0]).toBe(Link);
        expect(shape.cellTypes["Link"]).toBe(Link);
        expect(Object.keys(shape.cellTypes)).toEqual(["Other", "Type", "Link", "RichText"]);
        expectTypeOf<(typeof shape.objects)[number]>().toEqualTypeOf<typeof Type | typeof Other>();
        expectTypeOf<(typeof shape.morphisms)[number]>().toEqualTypeOf<typeof Link>();
        expectTypeOf<(typeof shape.morphisms)[number]["endpoints"]["codomain"]>().toEqualTypeOf<
            typeof Other.obType
        >();
    });

    test("only own enumerable declarations are included", () => {
        const objects: Record<string, typeof Type> = Object.create({ inherited: Type });
        objects["Type"] = Type;
        Object.defineProperty(objects, "hidden", { value: Type, enumerable: false });
        const shape = defineShape({ objects });
        expect(shape.objects).toEqual([Type]);
        expect(shape.cellTypes).toEqual({ Type });
        expect(defineShape({ objects: { ["__proto__"]: Type } }).cellTypes["__proto__"]).toBe(Type);
    });

    test("duplicate binding names cannot silently overwrite a declaration", () => {
        expect(() =>
            defineShape({ objects: { Cell: Type }, morphisms: { Cell: Aspect } }),
        ).toThrowError("Duplicate cell type name: Cell");
        expect(() =>
            defineShape({ objects: { Cell: Type }, informal: { Cell: RichText } }),
        ).toThrowError("Duplicate cell type name: Cell");
        expect(() =>
            defineShape({ objects: { PathEquation: Type }, supportsEquations: true }),
        ).toThrowError("Duplicate cell type name: PathEquation");
    });

    test("declaration categories reject incompatible cell types", () => {
        expectTypeOf<{ objects: { Wrong: typeof Aspect } }>().not.toExtend<ShapeDefinition>();
        expectTypeOf<{ morphisms: { Wrong: typeof Type } }>().not.toExtend<ShapeDefinition>();
        expectTypeOf<{
            informal: { Wrong: typeof PathEquation };
        }>().not.toExtend<ShapeDefinition>();
    });

    test("equation capabilities share a vocabulary type but control runtime bindings", () => {
        const enabled = defineShape({ supportsEquations: true });
        const disabled = defineShape({ supportsEquations: false });
        const uncertain = defineShape({ supportsEquations: Boolean(Date.now() % 2) });
        expectTypeOf(enabled.cellTypes).toEqualTypeOf<CellTypeVocabulary>();
        expectTypeOf(disabled.cellTypes).toEqualTypeOf<CellTypeVocabulary>();
        expectTypeOf(uncertain.cellTypes).toEqualTypeOf<CellTypeVocabulary>();
        expect(enabled.cellTypes["PathEquation"]).toBe(PathEquation);
        expect(disabled.cellTypes["PathEquation"]).toBeUndefined();
        expect(uncertain.cellTypes["PathEquation"]).toBe(
            uncertain.supportsEquations ? PathEquation : undefined,
        );
    });

    test("instance-capable shapes select table objects declared by the shape", () => {
        expect(SimpleSchema.supportsInstances.tableObjects).toEqual([SchemaEntity]);

        expect(() =>
            defineShape({
                objects: { SchemaEntity },
                supportsInstances: { tableObjects: [SchemaEntity] },
            }),
        ).toThrowError("An instance-capable shape must define a theory and its core theory");

        expect(() =>
            defineShape({
                theory: "invalid-instance-shape",
                getCoreTheory: SimpleSchema.getCoreTheory,
                objects: { Type },
                supportsInstances: { tableObjects: [SchemaEntity] },
            }),
        ).toThrowError("Instance table objects must be declared in the shape's objects");
    });
});
