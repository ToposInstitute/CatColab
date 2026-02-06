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
                description: "Free variable",
                shortcut: ["V"],
            },
            {
                tag: "MorType",
                morType: { tag: "Basic", content: "Multihom" },
                name: "Contribution",
                description: "Contribution term to the system",
                shortcut: ["C"],
            },
        ],
        modelAnalyses: [
        ],
    });
}
