import { Entity, Mapping, SimpleSchema } from "catcolab-logics/simple-schema";
import { describe, expect, test, vi } from "vitest";

import {
    createBinder,
    createInMemoryStore,
    PathEquation,
    RichText,
    type MorphismCellData,
    type ObjectCellData,
} from "catcolab-documents";

type Object = ObjectCellData<typeof Entity>;
type Morphism = MorphismCellData<typeof Mapping>;

async function schema() {
    const store = createInMemoryStore();
    const binder = createBinder(store);
    const notebook = await binder.createNotebook(SimpleSchema, { title: "Example schema" });
    const person = notebook.add(Entity, { label: "Person" });
    const company = notebook.add(Entity, { label: "Company" });
    const employer = notebook.add(Mapping, { label: "employer", from: person, to: company });
    const find = <C extends { id: string }>(cell: C) =>
        notebook.data().cells.find((candidate) => candidate.id === cell.id);
    return { store, notebook, person, company, employer, find };
}

describe("notebook updates", { timeout: 30000 }, () => {
    test("updates cells by data, by id reference, and by handle", async () => {
        const { notebook, person, company, employer, find } = await schema();
        const personData = find(person) as Object;
        notebook.update(personData, { label: "Human" });
        expect(find(person)).toMatchObject({ label: "Human" });

        notebook.update(
            {
                id: company.id,
                generatorId: company.generatorId,
                kind: "object",
                type: Entity,
                label: undefined,
            },
            {
                label: "Employer",
            },
        );
        expect(find(company)).toMatchObject({ label: "Employer" });

        notebook.update(employer, { label: "works for", from: company, to: person });
        expect(find(employer)).toMatchObject({
            label: "works for",
            from: { id: company.id },
            to: { id: person.id },
        });
        notebook.update(employer, { from: null });
        expect((find(employer) as Morphism).from).toBeNull();
    });

    test("updates rich text and equations", async () => {
        const { notebook, employer, person, find } = await schema();
        const intro = notebook.add(RichText, { content: "Intro" });
        notebook.update(intro, { content: "Changed" });
        expect(find(intro)).toMatchObject({ content: "Changed" });

        const equation = notebook.add(PathEquation, { label: "e", lhs: [employer], rhs: [] });
        const employerData = find(employer) as Morphism;
        notebook.update(equation, { rhs: [employerData], lhs: find(person) as Object });
        expect(find(equation)).toMatchObject({
            lhs: { id: person.id },
            rhs: [{ id: employer.id }],
        });
    });

    test("rejects missing and wrong-kind references before entering a change", async () => {
        const { store, notebook, person, employer } = await schema();
        const equation = notebook.add(PathEquation, { label: "e", lhs: [], rhs: [] });
        notebook.delete(person);
        const before = store.getDocumentSnapshot(notebook.handle);
        const change = vi.spyOn(store, "changeDocument");
        expect(() => notebook.update(employer, { label: "not written", from: person })).toThrow(
            `Cell ${person.id} does not exist.`,
        );
        expect(() => notebook.add(Mapping, { label: "not added", from: person, to: null })).toThrow(
            `Cell ${person.id} does not exist.`,
        );
        expect(() => notebook.update(employer, { from: employer as unknown as Object })).toThrow(
            `Cell ${employer.id} is not an object.`,
        );
        expect(() => notebook.update(equation, { lhs: [equation as unknown as Morphism] })).toThrow(
            `Cell ${equation.id} is not a morphism.`,
        );
        expect(change).not.toHaveBeenCalled();
        expect(store.getDocumentSnapshot(notebook.handle)).toBe(before);
        notebook.delete(employer);
        change.mockClear();
        expect(() => notebook.update(equation, { rhs: [employer] })).toThrow(
            `Cell ${employer.id} does not exist.`,
        );
        expect(change).not.toHaveBeenCalled();
        notebook.dispose();
    });

    test("deletes cells and ignores unknown ids", async () => {
        const { notebook, person, find } = await schema();
        const before = notebook.data().cells;
        notebook.update({ id: "missing" } as Object, { label: "x" });
        notebook.delete({ id: "missing" });
        expect(notebook.data().cells).toEqual(before);
        expect(notebook.data().cells[0]).toBe(before[0]);

        notebook.delete(person);
        expect(find(person)).toBeUndefined();
        expect(notebook.data().cells).toHaveLength(2);
    });
});
