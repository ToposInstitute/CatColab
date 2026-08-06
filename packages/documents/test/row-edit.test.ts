import { Attr, AttrType, Entity, Mapping, SimpleSchema } from "catcolab-logics/simple-schema";
import { describe, expect, test } from "vitest";

import { createBinder } from "catcolab-documents";

const binder = createBinder();

describe("instance row editing", () => {
    test("set and delete on rows", async () => {
        const schema = await binder.createNotebook(SimpleSchema, { title: "S" });
        const person = schema.add(Entity, { label: "Person" });
        const company = schema.add(Entity, { label: "Company" });
        const str = schema.add(AttrType, { label: "String" });
        const employer = schema.add(Mapping, { label: "employer", from: person, to: company });
        const nameAttr = schema.add(Attr, { label: "name", from: person, to: str });

        const instance = await binder.createInstance(schema, { title: "I" });
        const acme = instance.add(company, {});
        const fred = instance.add(person, {});

        // Setting an attribute records the literal; setting it again replaces it
        // (rather than accumulating a second value row).
        fred.set(nameAttr, "Fred");
        expect(fred.values["name"]).toBe("Fred");
        fred.set(nameAttr, "Freddy");
        expect(fred.values["name"]).toBe("Freddy");
        // The attribute's value rows are never listed as rows of the entity.
        expect(instance.rowsOf(person).length).toBe(1);

        // Setting a mapping points the row at the target row.
        fred.set(employer, acme);
        expect((fred.values["employer"] as { id: string }).id).toBe(acme.id);

        // Clearing an attribute removes its value.
        fred.set(nameAttr, undefined);
        expect(fred.values["name"]).toBeUndefined();

        // The instance still validates against its schema after edits.
        const result = await instance.validate();
        expect(result.tag).toBe("Valid");

        // Deleting a row removes it (and the value rows its attributes owned).
        fred.delete();
        expect(instance.rowsOf(person).length).toBe(0);
    });

    test("update row values by schema name", async () => {
        const schema = await binder.createNotebook(SimpleSchema, { title: "S" });
        const person = schema.add(Entity, { label: "Person" });
        const company = schema.add(Entity, { label: "Company" });
        const str = schema.add(AttrType, { label: "String" });
        schema.add(Mapping, { label: "employer", from: person, to: company });
        schema.add(Attr, { label: "name", from: person, to: str });

        const instance = await binder.createInstance(schema, { title: "I" });
        const acme = instance.add(company, {});
        const fred = instance.add(person, { name: "Fred" });

        fred.update({ name: "Freddy", employer: acme });

        expect(fred.values["name"]).toBe("Freddy");
        expect((fred.values["employer"] as { id: string }).id).toBe(acme.id);
        expect(() => fred.update({ unknown: "value" })).toThrow(
            'No mapping or attribute named "unknown" on schema object "Person".',
        );
    });

    test("two morphisms sharing a name are read independently by UUID", async () => {
        const schema = await binder.createNotebook(SimpleSchema, { title: "S" });
        const person = schema.add(Entity, { label: "Person" });
        const str = schema.add(AttrType, { label: "String" });
        // Two distinct attributes with the *same* name: they have distinct UUIDs
        // but collide in the name-keyed `values` view.
        const alias1 = schema.add(Attr, { label: "alias", from: person, to: str });
        const alias2 = schema.add(Attr, { label: "alias", from: person, to: str });
        expect(alias1.id).not.toBe(alias2.id);

        const instance = await binder.createInstance(schema, { title: "I" });
        const fred = instance.add(person, {});

        fred.set(alias1, "Freddy");
        fred.set(alias2, "Fred the Great");

        // UUID-keyed reads keep the two apart.
        expect(fred.get(alias1)).toBe("Freddy");
        expect(fred.get(alias2)).toBe("Fred the Great");
        expect(fred.valuesById[alias1.id]).toBe("Freddy");
        expect(fred.valuesById[alias2.id]).toBe("Fred the Great");

        // Setting one does not touch the other.
        fred.set(alias1, "Freddo");
        expect(fred.get(alias1)).toBe("Freddo");
        expect(fred.get(alias2)).toBe("Fred the Great");

        // The document stores two independent cell values, one per morphism UUID.
        const fredRow = Object.values(instance.document.tables)
            .flatMap((table) => Object.values(table.rows))
            .find((row) => row.id === fred.id);
        expect(Object.keys(fredRow?.fields ?? {}).length).toBe(2);

        // Clearing one leaves the other intact.
        fred.set(alias1, undefined);
        expect(fred.get(alias1)).toBeUndefined();
        expect(fred.get(alias2)).toBe("Fred the Great");
    });

    test("a dangling foreign key makes the instance invalid", async () => {
        const schema = await binder.createNotebook(SimpleSchema, { title: "S" });
        const person = schema.add(Entity, { label: "Person" });
        const company = schema.add(Entity, { label: "Company" });
        const employer = schema.add(Mapping, { label: "employer", from: person, to: company });

        const instance = await binder.createInstance(schema, { title: "I" });
        const acme = instance.add(company, {});
        const fred = instance.add(person, { employer: acme });

        // With the target present the instance validates.
        expect((await instance.validate()).tag).toBe("Valid");

        // Delete the target row: `fred`'s `employer` foreign key now dangles.
        acme.delete();

        // The foreign-key triple is retained (pointing at the gone row's id)...
        expect((fred.get(employer) as { id: string }).id).toBe(acme.id);
        // ...and validate() reports it rather than silently inferring the missing
        // codomain object away (which `inferMissingFrom` used to do).
        expect((await instance.validate()).tag).toBe("Invalid");
    });
});
