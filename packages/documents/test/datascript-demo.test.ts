import { Attr, AttrType, Entity, Mapping, SimpleSchema } from "catcolab-logics/simple-schema";
import { describe, expect, test } from "vitest";

import { createBinder } from "catcolab-documents";
import { projectDataScript, queryDataScript } from "../demo/src/datascript";
import { EXAMPLE_QUERY, loadExampleData } from "../demo/src/example-data";

const binder = createBinder();

async function createDocument() {
    const schema = await binder.createNotebook(SimpleSchema, { title: "Schema" });
    const instance = await binder.createInstance(schema, { title: "Instance" });
    return {
        schema,
        instance,
        stringType: schema.add(AttrType, { label: "String" }),
    };
}

describe("demo DataScript projection", () => {
    test("loads and queries the planets example", async () => {
        const schema = await binder.createNotebook(SimpleSchema, { title: "Schema" });
        const instance = await binder.createInstance(schema, { title: "Instance" });
        const attrTypes = {
            String: schema.add(AttrType, { label: "String" }),
            Boolean: schema.add(AttrType, { label: "Boolean" }),
            Integer: schema.add(AttrType, { label: "Integer" }),
            Float: schema.add(AttrType, { label: "Float" }),
        };

        loadExampleData({ schema, instance, attrTypes });

        expect(schema.cellsOf(Entity).map((cell) => cell.label)).toEqual([
            "Planet",
            "Spectral class",
            "Star",
            "Orbit",
            "Moon",
        ]);
        expect(instance.rows().length).toBe(115);
        await expect(instance.validate()).resolves.toMatchObject({ tag: "Valid" });

        const result = queryDataScript(projectDataScript({ schema, instance }), EXAMPLE_QUERY);
        expect(new Set(result.rows.map(([planetName]) => planetName))).toEqual(
            new Set(["Kepler 16 b", "PSR B1620 26 b"]),
        );
        expect(result.rows).toHaveLength(4);
    }, 15_000);

    test("queries attributes and mapping references by friendly names", async () => {
        const doc = await createDocument();
        const person = doc.schema.add(Entity, { label: "Person" });
        const company = doc.schema.add(Entity, { label: "Company" });
        doc.schema.add(Attr, { label: "name", from: person, to: doc.stringType });
        doc.schema.add(Attr, { label: "name", from: company, to: doc.stringType });
        doc.schema.add(Mapping, { label: "employer", from: person, to: company });

        const acme = doc.instance.add(company, { name: "Acme" });
        doc.instance.add(person, { name: "Fred", employer: acme });

        const result = queryDataScript(
            projectDataScript(doc),
            `[:find ?person-name ?company-name
              :where
              [?person "Person/name" ?person-name]
              [?person "Person/employer" ?company]
              [?company "Company/name" ?company-name]]`,
        );

        expect(result.columns).toEqual(["person-name", "company-name"]);
        expect(result.rows).toEqual([["Fred", "Acme"]]);
    });

    test("disambiguates duplicate labels and follows schema renames", async () => {
        const doc = await createDocument();
        const person = doc.schema.add(Entity, { label: "Person" });
        const alias1 = doc.schema.add(Attr, {
            label: "alias",
            from: person,
            to: doc.stringType,
        });
        const alias2 = doc.schema.add(Attr, {
            label: "alias",
            from: person,
            to: doc.stringType,
        });
        const row = doc.instance.add(person, {});
        row.set(alias1, "Fred");
        row.set(alias2, "Freddy");

        const duplicateProjection = projectDataScript(doc);
        const duplicateAttributes = duplicateProjection.attributes.map(
            ({ attribute }) => attribute,
        );
        expect(new Set(duplicateAttributes).size).toBe(2);
        expect(
            duplicateAttributes.every((attribute) => attribute.startsWith("Person/alias-")),
        ).toBe(true);

        alias1.update({ label: "nickname" });
        const renamedProjection = projectDataScript(doc);
        expect(renamedProjection.attributes.map(({ attribute }) => attribute)).toEqual([
            "Person/nickname",
            "Person/alias",
        ]);
        const result = queryDataScript(
            renamedProjection,
            `[:find ?name :where [?row "Person/nickname" ?name]]`,
        );
        expect(result.rows).toEqual([["Fred"]]);
    });

    test("retains a queryable placeholder for dangling mapping references", async () => {
        const doc = await createDocument();
        const person = doc.schema.add(Entity, { label: "Person" });
        const company = doc.schema.add(Entity, { label: "Company" });
        const employer = doc.schema.add(Mapping, { label: "employer", from: person, to: company });
        const acme = doc.instance.add(company, {});
        const fred = doc.instance.add(person, {});
        fred.set(employer, acme);
        const acmeId = acme.id;
        acme.delete();

        const result = queryDataScript(
            projectDataScript(doc),
            `[:find ?row-id
              :where
              [?person "Person/employer" ?missing]
              [?missing "catcolab/row-id" ?row-id]
              [?missing "catcolab/dangling" true]]`,
        );

        expect(result.rows).toEqual([[acmeId]]);
    });
});
