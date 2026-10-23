import { Aspect, SimpleOlog, Type } from "catcolab-logics/simple-olog";
import { describe, test } from "vitest";

import type { Document } from "catcolab-document-types";
import {
    createBinder,
    defineMorphism,
    defineObject,
    defineShape,
    RichText,
    type Notebook,
} from "catcolab-documents";

type InstanceDocument = Extract<Document, { type: "instance" }>;

const Entity = defineObject({ tag: "Basic", content: "Entity" });
const AttrType = defineObject({ tag: "Basic", content: "AttrType" });
const Attr = defineMorphism(
    { tag: "Basic", content: "Attr" },
    { domain: Entity.obType, codomain: AttrType.obType },
);
const SimpleSchema = defineShape({
    theory: "simple-schema",
    objects: [Entity, AttrType],
    morphisms: [Attr],
});

describe("creating and editing notebooks (type level)", () => {
    test("instance documents cannot back notebooks", () => {
        // @ts-expect-error Instance documents contain tables rather than notebooks.
        const notebook = null as unknown as Notebook<typeof SimpleOlog, InstanceDocument>;
        void notebook;
    });

    test("invalid shapes are type errors in a simple olog", async () => {
        const binder = createBinder();
        const notebook = await binder.createNotebook(SimpleOlog, { title: "An Olog" });

        const source = notebook.add(Type, { label: "A" });
        const target = notebook.add(Type, { label: "B" });
        const arrow = notebook.add(Aspect, { label: "has", from: source, to: target });

        // @ts-expect-error Arrays are not valid endpoints in a simple olog.
        notebook.update(arrow, { from: [source] });

        // @ts-expect-error Arrays are not valid endpoints in a simple olog.
        notebook.add(Aspect, { label: "bad", from: [source, target], to: target });
        // @ts-expect-error Missing required fields.
        notebook.add(Aspect, {});
        // null fields are allowed.
        notebook.add(Aspect, { label: null, from: null, to: null });
    });

    test("domain and codomain object types are checked independently", async () => {
        const binder = createBinder();
        const notebook = await binder.createNotebook(SimpleSchema, { title: "A schema" });

        const entity = notebook.add(Entity, { label: "Person" });
        const attrType = notebook.add(AttrType, { label: "String" });
        const attr = notebook.add(Attr, {
            label: "name",
            from: entity,
            to: attrType,
        });

        notebook.update(attr, { from: entity, to: attrType });

        // @ts-expect-error Attribute domains must be entities.
        notebook.update(attr, { from: attrType });
        // @ts-expect-error Attribute codomains must be attribute types.
        notebook.update(attr, { to: entity });
        // @ts-expect-error Attribute endpoints cannot be reversed.
        notebook.add(Attr, { label: "bad", from: attrType, to: entity });
    });
});

describe("notebook.update endpoint typing", () => {
    test("rejects endpoints of the wrong type", async () => {
        const binder = createBinder();
        const notebook = await binder.createNotebook(SimpleSchema, { title: "A schema" });

        const entity = notebook.add(Entity, { label: "Person" });
        const attrType = notebook.add(AttrType, { label: "String" });
        const attr = notebook.add(Attr, { label: "name", from: entity, to: attrType });
        const attrData = notebook.data().cells.find((cell) => cell.id === attr.id);
        if (attrData?.kind !== "morphism") {
            throw new Error("expected morphism data");
        }

        notebook.update(attr, { from: entity, to: attrType });
        notebook.update(attrData, { label: "name" });
        // @ts-expect-error Attribute domains must be entities.
        notebook.update(attr, { from: attrType });
        // @ts-expect-error Object cells have no endpoints.
        notebook.update(entity, { from: entity });
        // @ts-expect-error Rich text cells have no label.
        notebook.update(notebook.add(RichText, { content: "x" }), { label: "x" });
    });
});
