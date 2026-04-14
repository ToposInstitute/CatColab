import { lazy } from "solid-js";

import { ThSignedPolynomialODE } from "catlog-wasm";
import { Theory, type TheoryMeta } from "../../theory";
import * as analyses from "../analyses";

const ObjectCellEditor = lazy(() => import("../../model/object_cell_editor"));
const ContributionCellEditor = lazy(() => import("../../model/contribution_cell_editor"));

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
                editor: ContributionCellEditor,
                name: "Positive contribution",
                description: "Additive monomial contribution to the system of ODEs",
                shortcut: ["C"],
                arrowStyle: "plus",
            },
            {
                tag: "MorType",
                morType: { tag: "Basic", content: "NegativeContribution" },
                editor: ContributionCellEditor,
                name: "Negative contribution",
                description: "Subtractive monomial contribution to the system of ODEs",
                shortcut: ["N"],
                arrowStyle: "minus",
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
