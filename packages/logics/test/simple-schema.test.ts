import { SimpleOlog } from "catcolab-logics/simple-olog";
import { Attr, AttrType, Entity, Mapping, SimpleSchema } from "catcolab-logics/simple-schema";
import { describe, expect, test } from "vitest";

// The `simple-schema` logic (RFC-0006 "Defining notebook shapes").
//
// `catcolab-logics/simple-schema` binds the theory of schemas to the frontend
// as a shape: basic `Entity` and `AttrType` objects, a `Hom` `Mapping` between
// entities, a basic `Attr` from entities to attribute types, rich text,
// equations, instances and a migration to `simple-olog`.
import { createBinder, RichText } from "catcolab-documents";

describe("the simple-schema logic", () => {
    test("Entity and AttrType are basic objects; Mapping and Attr relate them", async () => {
        const binder = createBinder();
        const notebook = await binder.createNotebook(SimpleSchema, { title: "Example schema" });

        expect(notebook.document.theory).toBe("simple-schema");
        expect(Entity.obType).toEqual({ tag: "Basic", content: "Entity" });
        expect(AttrType.obType).toEqual({ tag: "Basic", content: "AttrType" });

        const person = notebook.add(Entity, { label: "Person" });
        const company = notebook.add(Entity, { label: "Company" });
        const str = notebook.add(AttrType, { label: "String" });

        const employer = notebook.add(Mapping, { label: "employer", from: person, to: company });
        const name = notebook.add(Attr, { label: "name", from: person, to: str });

        expect(person.type.obType.content).toBe("Entity");
        expect(str.type.obType.content).toBe("AttrType");
        expect(employer.type.morType.tag).toBe("Hom");
        expect(name.type.morType).toEqual({ tag: "Basic", content: "Attr" });
    });

    test("declares how schemas are validated and instantiated", async () => {
        expect(SimpleSchema.supportsInstances.tableObjects).toEqual([Entity]);

        const theory = await SimpleSchema.getCoreTheory();
        try {
            expect(theory.hasObType(Entity.obType)).toBe(true);
            expect(theory.hasObType(AttrType.obType)).toBe(true);
            expect(theory.hasMorType(Mapping.morType)).toBe(true);
            expect(theory.hasMorType(Attr.morType)).toBe(true);
        } finally {
            theory.free();
        }
    }, 15_000);

    test.skip("notebooks validate against the core theory of schemas", async () => {
        const binder = createBinder();
        const notebook = await binder.createNotebook(SimpleSchema, { title: "Example schema" });

        const person = notebook.add(Entity, { label: "Person" });
        const company = notebook.add(Entity, { label: "Company" });
        const str = notebook.add(AttrType, { label: "String" });
        notebook.add(Mapping, { label: "employer", from: person, to: company });
        notebook.add(Attr, { label: "name", from: person, to: str });

        const result = await notebook.validate();
        expect(result.issues).toEqual([]);
        expect(result.model.judgmentsOf(Entity).length).toBe(2);
        expect(result.model.judgmentsOf(AttrType).length).toBe(1);
        expect(result.model.judgmentsOf(Mapping).length).toBe(1);
        expect(result.model.judgmentsOf(Attr).length).toBe(1);
    });

    test("the shape supports rich text", async () => {
        const binder = createBinder();
        const notebook = await binder.createNotebook(SimpleSchema, { title: "Example schema" });

        const note = notebook.add(RichText, { content: "A note." });
        expect(note.content).toBe("A note.");
    });

    test.skip("supportsInstances generates the .Diagram shape", async () => {
        const binder = createBinder();
        const model = await binder.createNotebook(SimpleSchema, { title: "Example schema" });

        const person = model.add(Entity, { label: "Person" });

        const diagram = await binder.createNotebook(SimpleSchema.Diagram, {
            title: "Schema diagram",
            in: model,
        });

        const x = diagram.add(SimpleSchema.Diagram.Individual, { label: "x", over: person });
        expect(x.over?.label).toBe("Person");
    });

    test.skip("schemas migrate to simple-olog", async () => {
        const binder = createBinder();
        const schema = await binder.createNotebook(SimpleSchema, { title: "Example schema" });

        const person = schema.add(Entity, { label: "Person" });
        const company = schema.add(Entity, { label: "Company" });
        schema.add(Mapping, { label: "employer", from: person, to: company });

        const migration = await schema.migrateTo(SimpleOlog);
        expect(migration.tag).toBe("Ok");
        if (migration.tag !== "Ok") {
            return;
        }
        expect(migration.content.document.theory).toBe("simple-olog");
        expect((await migration.content.validate()).issues).toEqual([]);
    });
});
