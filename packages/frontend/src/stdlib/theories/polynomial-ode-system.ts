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
                morType: {
                    tag: "Hom",
                    content: { tag: "Basic", content: "Object" },
                },
                name: "Contribution",
                description: "Contribution term to the system",
                shortcut: ["C"],
                domain: {
                    apply: { tag: "Basic", content: "tensor" },
                },
                codomain: {
                    apply: { tag: "Basic", content: "Object" },
                },
            },
        ],
        modelAnalyses: [
        ],
    });
}
