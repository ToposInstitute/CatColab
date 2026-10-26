import { SimpleOlog } from "catcolab-logics/simple-olog";
import { Entity, Mapping, SimpleSchema } from "catcolab-logics/simple-schema";
import { describe, expect, test } from "vitest";

import { createBinder, PathEquation, RichText } from "catcolab-documents";

describe("notebook data", { timeout: 30000 }, () => {
    test("ordered snapshots resolve references and stay unchanged after edits", async () => {
        const notebook = await createBinder().createNotebook(SimpleSchema, { title: "Schema" });
        const intro = notebook.add(RichText, { content: "A schema." });
        const person = notebook.add(Entity, { label: "Person" });
        const company = notebook.add(Entity, { label: "Company" });
        const employer = notebook.add(Mapping, { label: "employer", from: person, to: company });
        const equation = notebook.add(PathEquation, {
            label: "e",
            lhs: [employer],
            rhs: [employer],
        });
        const before = notebook.data();
        expect(notebook.data()).toBe(before);
        expect(before.cells.map((cell) => cell.id)).toEqual(
            [intro, person, company, employer, equation].map((cell) => cell.id),
        );
        const [, personData, companyData, employerData, equationData] = before.cells;
        if (employerData?.kind !== "morphism" || equationData?.kind !== "path-equation") {
            throw new Error("Expected morphism and equation data");
        }
        expect(employerData.from).toBe(personData);
        expect(employerData.to).toBe(companyData);
        expect((equationData.lhs as readonly unknown[])[0]).toBe(employerData);
        expect(structuredClone(before)).toEqual(before);
        notebook.update(person, { label: "Human" });
        expect(notebook.data()).not.toBe(before);
        expect(before.cells[1]).toMatchObject({ label: "Person" });
        expect(notebook.data().cells[1]).toMatchObject({ label: "Human" });
        notebook.dispose();
    });

    test("loading checks document kind and theory compatibility", async () => {
        const binder = createBinder();
        const notebook = await binder.createNotebook(SimpleSchema, { title: "Schema" });
        const instance = await binder.createInstance(notebook, { title: "Data" });
        if (instance.tag === "Err") {
            throw new Error("Expected an instance");
        }
        expect(
            await binder.loadNotebookFromRef(SimpleOlog, binder.getDocumentRef(notebook.handle)),
        ).toMatchObject({ tag: "Err", content: [{ path: ["theory"] }] });
        expect(
            await binder.loadNotebookFromRef(
                SimpleSchema,
                binder.getDocumentRef(instance.content.handle),
            ),
        ).toMatchObject({ tag: "Err", content: [{ path: ["type"] }] });
        instance.content.dispose();
        notebook.dispose();
    });
});
