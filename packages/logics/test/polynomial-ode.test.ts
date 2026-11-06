import { expect, test } from "vitest";

import { createBinder } from "catcolab-documents";
import { PolynomialODE, Variable, Contribution } from "../src/polynomial-ode";
import {
    SignedPolynomialODE,
    Variable as SignedVariable,
    PositiveContribution,
    NegativeContribution,
} from "../src/signed-polynomial-ode";

test("polynomial contributions have symmetric lists of inputs", async () => {
    const notebook = await createBinder().createNotebook(PolynomialODE, { title: "ODE" });
    const x = notebook.add(Variable, { label: "x" });
    const y = notebook.add(Variable, { label: "y" });
    const contribution = notebook.add(Contribution, { label: "growth", from: [x, x, y], to: x });
    notebook.add(Contribution, { label: "constant", from: [], to: y });
    expect(contribution.from).toEqual([x, x, y]);
    const validation = await notebook.validate();
    expect(validation.issues).toEqual([]);
    expect(validation.model.judgmentsOf(Contribution)).toHaveLength(2);
    notebook.dispose();
}, 60_000);

test("signed polynomial contributions support both signs", async () => {
    const notebook = await createBinder().createNotebook(SignedPolynomialODE, {
        title: "Signed ODE",
    });
    const x = notebook.add(SignedVariable, { label: "x" });
    notebook.add(PositiveContribution, { label: "growth", from: [x], to: x });
    notebook.add(NegativeContribution, { label: "decay", from: [x, x], to: x });
    expect((await notebook.validate()).issues).toEqual([]);
    notebook.dispose();
}, 60_000);
