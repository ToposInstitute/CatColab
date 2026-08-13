import { Aspect, SimpleOlog, Type } from "catcolab-logics/simple-olog";
import { Entity, Mapping, SimpleSchema } from "catcolab-logics/simple-schema";
import { describe, expect, test } from "vitest";

// RFC-0006 "Iterating through cells".
//
// A `cells` method iterates through all cells of the notebook; `cellsOf`
// filters by cell type (or by `Shape`, covered in shapes.test.ts). Neither
// recurses into instantiations.
import { CellKind, createBinder, Instantiation, RichText } from "catcolab-documents";

describe("iterating through cells", () => {
    test("cells() iterates all cells with kind discriminants", async () => {
        const binder = createBinder();
        const notebook = await binder.createNotebook(SimpleOlog, { title: "An Olog" });

        const intro = notebook.add(RichText, { content: "We define a simple olog." });
        const source = notebook.add(Type, { label: "A" });
        const target = notebook.add(Type, { label: "B" });
        const arrow = notebook.add(Aspect, { label: "has", from: source, to: target });

        notebook.update({ title: "A simple Olog example" });
        intro.update({
            content: "We define a simple olog with two objects and one arrow.",
        });
        source.update({ label: "Source" });
        arrow.update({ label: "has as", from: source, to: target });

        const lines: string[] = [];
        for (const cell of notebook.cells()) {
            switch (cell.kind) {
                case CellKind.RichText:
                    lines.push(`text: ${cell.content}`);
                    break;
                case CellKind.Object:
                    lines.push(`object: ${cell.label} type: ${cell.type.obType.content}`);
                    break;
                case CellKind.Morphism:
                    lines.push(`morphism: ${cell.label} type tag: ${cell.type.morType.tag}`);
                    break;
            }
        }

        expect(lines).toEqual([
            "text: We define a simple olog with two objects and one arrow.",
            "object: Source type: Object",
            "object: B type: Object",
            "morphism: has as type tag: Hom",
        ]);
    });

    test("cellsOf() filters cells by cell type", async () => {
        const binder = createBinder();
        const notebook = await binder.createNotebook(SimpleSchema, { title: "Example schema" });

        const person = notebook.add(Entity, { label: "Person" });
        const company = notebook.add(Entity, { label: "Company" });

        notebook.add(Mapping, { label: "employer", from: person, to: company });

        const entities = notebook.cellsOf(Entity);
        const mappings = notebook.cellsOf(Mapping);

        expect(entities.map((cell) => cell.label).join(", ")).toBe("Person, Company");
        expect(mappings.map((cell) => cell.label).join(", ")).toBe("employer");
    });

    test("cells and cellsOf do not recurse into instantiations", async () => {
        const binder = createBinder();
        const notebook = await binder.createNotebook(SimpleSchema, { title: "Example schema" });

        const person = notebook.add(Entity, { label: "Person" });
        const company = notebook.add(Entity, { label: "Company" });
        notebook.add(Mapping, { label: "employer", from: person, to: company });

        const anotherSchema = await binder.createNotebook(SimpleSchema, {
            title: "Another schema",
        });
        const enterprise = anotherSchema.add(Entity, { label: "Enterprise" });
        const building = anotherSchema.add(Entity, { label: "Building" });
        anotherSchema.add(Mapping, { label: "owner", from: enterprise, to: building });

        notebook.add(Instantiation, {
            label: "ImportedSchema",
            model: anotherSchema,
            specializations: [{ object: enterprise, as: company }],
        });

        const instantiations = notebook.cellsOf(Instantiation);
        const entities = notebook.cellsOf(Entity);
        const mappings = notebook.cellsOf(Mapping);

        expect(instantiations.map((cell) => cell.label).join(", ")).toBe("ImportedSchema");
        expect(entities.map((cell) => cell.label).join(", ")).toBe("Person, Company");
        expect(mappings.map((cell) => cell.label).join(", ")).toBe("employer");
    });
});
