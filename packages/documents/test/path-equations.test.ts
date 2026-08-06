import { Entity, Mapping, SimpleSchema } from "catcolab-logics/simple-schema";
import { describe, expect, test } from "vitest";

// RFC-0006 "Path equations": `PathEquation` is another cell type, with a
// `CellKind.PathEquation` discriminant, that a shape opts into via
// `supportsEquations: true`.
import { createBinder, PathEquation } from "catcolab-documents";

describe("path equations", () => {
    test("a path equation cell relates two paths of morphisms", async () => {
        const binder = createBinder();
        const notebook = await binder.createNotebook(SimpleSchema, { title: "Example schema" });

        const person = notebook.add(Entity, { label: "Person" });
        const department = notebook.add(Entity, { label: "Department" });
        const company = notebook.add(Entity, { label: "Company" });

        const worksIn = notebook.add(Mapping, { label: "works in", from: person, to: department });
        const partOf = notebook.add(Mapping, { label: "part of", from: department, to: company });
        const employer = notebook.add(Mapping, { label: "employer", from: person, to: company });

        // An employee's employer is the company their department is part of.
        const equation = notebook.add(PathEquation, {
            label: "employment",
            lhs: [worksIn, partOf],
            rhs: [employer],
        });

        expect(equation.label).toBe("employment");
        expect(equation.lhs.map((step) => step.label).join(" ; ")).toBe("works in ; part of");
        expect(equation.rhs.map((step) => step.label).join(" ; ")).toBe("employer");
        expect(notebook.cellsOf(PathEquation).length).toBe(1);

        const result = await notebook.validate();
        expect(result.tag).toBe("Ok");
    });
});
