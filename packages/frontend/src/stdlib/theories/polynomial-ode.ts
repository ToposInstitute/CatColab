import { ThPolynomialODE } from "catlog-wasm";
import { Theory, type TheoryMeta } from "../../theory";
import * as analyses from "../analyses";

export default function createPolynomialODETheory(theoryMeta: TheoryMeta): Theory {
    const thPolynomialODE = new ThPolynomialODE();

    return new Theory({
        ...theoryMeta,
        theory: thPolynomialODE.theory(),
        onlyFreeModels: true,
        modelTypes: [
            {
                tag: "ObType",
                obType: { tag: "Basic", content: "State" },
                name: "Variable",
                description: "State variable in ODE system",
                shortcut: ["V"],
            },
            {
                tag: "MorType",
                morType: { tag: "Basic", content: "Contribution" },
                name: "Contribution",
                description: "Monomial contribution to ODE system",
                shortcut: ["C"],
            },
        ],
        modelAnalyses: [
            analyses.polynomialODEEquations({
                getEquations(model, data) {
                    return thPolynomialODE.polynomialODEEquations(model, data);
                },
            }),
            analyses.polynomialODESimulation({
                simulate(model, data) {
                    return thPolynomialODE.polynomialODESimulation(model, data);
                },
            }),
        ],
    });
}
