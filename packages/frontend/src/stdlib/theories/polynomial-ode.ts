import { ThSymMulticategory } from "catlog-wasm";
import { Theory, type TheoryMeta } from "../../theory";

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
                morType: {
                    tag: "ModeApp",
                    content: {
                        modality: "SymmetricList",
                        morType: { tag: "Basic", content: "Multihom" },
                    },
                },
                name: "Contribution",
                description: "Monomial contribution to the system of ODEs",
                shortcut: ["C"],
            },
        ],
        modelAnalyses: [],
    });
}
