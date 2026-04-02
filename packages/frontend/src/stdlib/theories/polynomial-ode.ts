import { ThSymMulticategory } from "catlog-wasm";
import { Theory, type TheoryMeta } from "../../theory";
import * as analyses from "../analyses";

export default function createPolynomialODETheory(theoryMeta: TheoryMeta): Theory {
    const thSymMulticategory = new ThSymMulticategory();

    return new Theory({
        ...theoryMeta,
        theory: thSymMulticategory.theory(),
        onlyFreeModels: true,
        modelTypes: [
            {
                tag: "ObType",
                obType: { tag: "Basic", content: "Object" },
                name: "Variable",
                description: "Variable in ring of polynomials",
                shortcut: ["V"],
            },
            {
                tag: "MorType",
                morType: { tag: "Basic", content: "Multihom" },
                name: "Contribution",
                description: "Monomial contribution to the system of ODEs",
                shortcut: ["C"],
            },
        ],
        modelAnalyses: [
            analyses.polynomialODEEquations({
                getEquations(model, data) {
                    return thSymMulticategory.polynomialODEEquations(model, data);
                },
            }),
            analyses.polynomialODESimulation({
                simulate(model, data) {
                    return thSymMulticategory.polynomialODESimulation(model, data);
                },
            }),
        ],
    });
}
