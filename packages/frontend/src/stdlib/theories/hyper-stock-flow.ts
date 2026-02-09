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
            // {
            //     tag: "MorType",
            //     morType: { tag: "Basic", content: "Multihom" },
            //     name: "Catalysis",
            //     description: "Change in the target with no change in the sources",
            //     shortcut: ["C"],
            //     arrowStyle: "doubleLess",
            // },
            // {
            //     tag: "MorType",
            //     morType: { tag: "Basic", content: "Multihom" },
            //     name: "Consumption",
            //     description: "Change in the sources with no change in the target",
            //     shortcut: ["N"],
            //     arrowStyle: "doubleMore",
            // },
        ],
        modelAnalyses: [
        ],
    });
}