import { ThDegDelSignedCategory } from "catlog-wasm";

import { Theory } from "../../theory";
import * as analyses from "../analyses";
import type { TheoryMeta } from "../types";

export default function createExtendedCausalLoopTheory(theoryMeta: TheoryMeta): Theory {
    const thDegDelSignedCategory = new ThDegDelSignedCategory();

    return new Theory({
        ...theoryMeta,
        theory: thDegDelSignedCategory.theory(),
        onlyFreeModels: true,
        modelTypes: [
            {
                tag: "ObType",
                obType: { tag: "Basic", content: "Object" },
                name: "Variable",
                shortcut: ["V"],
                description: "Variable quantity",
            },
            {
                tag: "MorType",
                morType: {
                    tag: "Hom",
                    content: { tag: "Basic", content: "Object" },
                },
                name: "Positive degree 0",
                shortcut: ["P"],
                description: "Positive influence",
                arrowStyle: "plus",
                preferUnnamed: true,
            },
            {
                tag: "MorType",
                morType: { tag: "Basic", content: "Negative" },
                name: "Negative degree 0",
                shortcut: ["N"],
                description: "Negative influence",
                arrowStyle: "minus",
                preferUnnamed: true,
            },
            {
                tag: "MorType",
                morType: { tag: "Basic", content: "Degree" },
                name: "Positive degree 1",
                description: "Positive influence on the derivative",
                arrowStyle: "plusDeg",
                preferUnnamed: true,
            },
            {
                tag: "MorType",
                morType: {
                    tag: "Composite",
                    content: [
                        { tag: "Basic", content: "Negative" },
                        { tag: "Basic", content: "Degree" },
                    ],
                },
                name: "Negative degree 1",
                description: "Negative influence on the derivative",
                arrowStyle: "minusDeg",
                preferUnnamed: true,
            },
            {
                tag: "MorType",
                morType: {
                    tag: "Composite",
                    content: [
                        { tag: "Basic", content: "Degree" },
                        { tag: "Basic", content: "Degree" },
                    ],
                },
                name: "Positive degree 2",
                description: "Positive influence on the second derivative",
                arrowStyle: "plusDeg",
                preferUnnamed: true,
            },
            {
                tag: "MorType",
                morType: {
                    tag: "Composite",
                    content: [
                        { tag: "Basic", content: "Negative" },
                        { tag: "Basic", content: "Degree" },
                        { tag: "Basic", content: "Degree" },
                    ],
                },
                name: "Negative degree 2",
                description: "Negative influence on the second derivative",
                arrowStyle: "minusDeg",
                preferUnnamed: true,
            },
            {
                tag: "MorType",
                morType: {
                    tag: "Composite",
                    content: [
                        { tag: "Basic", content: "Degree" },
                        { tag: "Basic", content: "Degree" },
                        { tag: "Basic", content: "Degree" },
                        { tag: "Basic", content: "Degree" },
                    ],
                },
                name: "Positive degree 4",
                description: "Positive influence on the fourth derivative",
                arrowStyle: "plusDeg",
                preferUnnamed: true,
            },
        ],
        modelAnalyses: [
            analyses.configureModelGraph({
                id: "diagram",
                name: "Visualization",
                description: "Visualize the extended causal loop diagram",
                help: "visualization",
            }),
        ],
    });
}
