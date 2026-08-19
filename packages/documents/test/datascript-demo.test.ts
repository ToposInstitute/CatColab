import { Attr, Entity, Mapping } from "catcolab-logics/simple-schema";
import { describe, expect, test } from "vitest";

import { projectDataScript, queryDataScript } from "../demo/src/datascript";
import { createDemoDocument } from "../demo/src/document";
import { EXAMPLE_QUERY, loadExampleData } from "../demo/src/example-data";

async function createDocument() {
    localStorage.clear();
    const doc = await createDemoDocument();
    return {
        ...doc,
        stringType: doc.attrTypes.String,
    };
}

describe("demo DataScript projection", () => {
    test("loads and queries the planets example", async () => {
        localStorage.clear();
        const doc = await createDemoDocument();
        const { schema, instance: instanceDocument } = doc;

        await loadExampleData(doc);

        expect(schema.cellsOf(Entity).map((cell) => cell.label)).toEqual([
            "Planet",
            "Spectral class",
            "Star",
            "Orbit",
            "Moon",
        ]);
        expect(doc.tables().flatMap((table) => table.rows)).toHaveLength(115);
        await expect(instanceDocument.validate()).resolves.toMatchObject({ tag: "Ok" });

        const result = queryDataScript(projectDataScript(doc), EXAMPLE_QUERY);
        expect(new Set(result.rows.map(([planetName]) => planetName))).toEqual(
            new Set(["Kepler 16 b", "PSR B1620 26 b"]),
        );
        expect(result.rows).toHaveLength(4);
        // Debug-build wasm validation of the full planets instance is slow, and
        // slower still when the whole suite runs in parallel.
    }, 60_000);

    test("queries attributes and mapping references by friendly names", async () => {
        const doc = await createDocument();
        const person = doc.schema.add(Entity, { label: "Person" });
        const company = doc.schema.add(Entity, { label: "Company" });
        doc.schema.add(Attr, { label: "name", from: person, to: doc.stringType });
        doc.schema.add(Attr, { label: "name", from: company, to: doc.stringType });
        doc.schema.add(Mapping, { label: "employer", from: person, to: company });

        await doc.refreshTables();
        const acme = doc.addRow(company);
        doc.setRowValue(
            company,
            acme,
            doc.schema.cellsOf(Attr).find((c) => c.from?.id === company.id)!,
            "Acme",
        );
        const fred = doc.addRow(person);
        doc.setRowValue(
            person,
            fred,
            doc.schema.cellsOf(Attr).find((c) => c.from?.id === person.id)!,
            "Fred",
        );
        doc.setRowValue(person, fred, doc.schema.cellsOf(Mapping)[0]!, acme);

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
        await doc.refreshTables();
        const row = doc.addRow(person);
        doc.setRowValue(person, row, alias1, "Fred");
        doc.setRowValue(person, row, alias2, "Freddy");

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
        await doc.refreshTables();
        const acme = doc.addRow(company);
        const fred = doc.addRow(person);
        doc.setRowValue(person, fred, employer, acme);
        const acmeId = doc.rowId(company, acme)!;
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
