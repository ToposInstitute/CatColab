import { ThMulticategory } from "catlog-wasm";
import { Theory, type TheoryMeta } from "../../theory";

export default function createHyperStockFlow(theoryMeta: TheoryMeta): Theory {
    const thMulticategory = new ThMulticategory();

    return new Theory({
        ...theoryMeta,
        theory: thMulticategory.theory(),
        onlyFreeModels: true,
        modelTypes: [
            {
                tag: "ObType",
                obType: { tag: "Basic", content: "Object" },
                name: "Stock",
                description: "Things with an amount",
                shortcut: ["S"],
            },
            {
                tag: "MorType",
                morType: { tag: "Basic", content: "Multihom" },
                name: "Flow",
                description: "Flow from one-or-more stocks to another",
                shortcut: ["F"],
                arrowStyle: "double",
            },
            {
                tag: "MorType",
                morType: { tag: "Basic", content: "Multihom" },
                name: "Catalysis",
                description: "Catalytic growth effect of the target",
                shortcut: ["C"],
                arrowStyle: "double",
            },
            {
                tag: "MorType",
                morType: { tag: "Basic", content: "Multihom" },
                name: "Consumption",
                description: "Consumption of the sources",
                shortcut: ["N"],
                arrowStyle: "double",
            },
        ],
        modelAnalyses: [
        ],
    });
}