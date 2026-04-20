import { lazy } from "solid-js";

import { ThSignedPolynomialODE } from "catlog-wasm";
import { Theory, type TheoryMeta } from "../../theory";
import * as analyses from "../analyses";

const ObjectCellEditor = lazy(() => import("../../model/object_cell_editor"));
const PositiveContributionEditor = lazy(() =>
    import("../../model/contribution_cell_editor").then((m) => ({
        default: m.PositiveContributionCellEditor,
    })),
);
const NegativeContributionEditor = lazy(() =>
    import("../../model/contribution_cell_editor").then((m) => ({
        default: m.NegativeContributionCellEditor,
    })),
);

export default function createSignedPolynomialODETheory(theoryMeta: TheoryMeta): Theory {
    const thSignedPolynomialODE = new ThSignedPolynomialODE();

    return new Theory({
        ...theoryMeta,
        theory: thSignedPolynomialODE.theory(),
        onlyFreeModels: true,
        modelTypes: [
            {
                tag: "ObType",
                obType: { tag: "Basic", content: "State" },
                editor: ObjectCellEditor,
                name: "Variable",
                description: "Variable in ring of polynomials",
                shortcut: ["V"],
            },
            {
                tag: "MorType",
                morType: { tag: "Basic", content: "Contribution" },
                editor: PositiveContributionEditor,
                name: "Positive contribution",
                description: "Additive monomial contribution to the system of ODEs",
                shortcut: ["P"],
            },
            {
                tag: "MorType",
                morType: { tag: "Basic", content: "NegativeContribution" },
                editor: NegativeContributionEditor,
                name: "Negative contribution",
                description: "Subtractive monomial contribution to the system of ODEs",
                shortcut: ["N"],
            },
        ],
        modelAnalyses: [
            analyses.polynomialODEEquations({
                getEquations(model, data) {
                    return thSignedPolynomialODE.polynomialODEEquations(model, data);
                },
            }),
            analyses.polynomialODESimulation({
                signedContributions: true,
                simulate(model, data) {
                    return thSignedPolynomialODE.polynomialODESimulation(model, data);
                },
            }),
        ],
    });
}
