import { ThDEC } from "catlog-wasm";
import { type DiagramAnalysisMeta, Theory, type TheoryMeta } from "../../theory";
import * as analyses from "../analyses";

export default function createThDECTheory(theoryMeta: TheoryMeta): Theory {
    const thDEC = new ThDEC();
    const diagramAnalyses: DiagramAnalysisMeta[] = [
        analyses.modalDiagramGraph({
            id: "graph",
            name: "Visualization",
            description: "Visualize the instance as a graph",
            help: "visualization",
        }),
        analyses.decapodes({
            id: "decapodes",
            name: "Simulation",
            description: "Simulate the PDE using Decapodes",
        }),
    ];

    return new Theory({
        ...theoryMeta,
        theory: thDEC.theory(),
        modelTypes: [
            {
                tag: "ObType",
                obType: { tag: "Basic", content: "Object" },
                name: "Form",
                description: "State of the system",
                shortcut: ["O"],
            },
            {
                tag: "MorType",
                morType: {
                    tag: "Basic",
                    content: "Multihom",
                },
                name: "Operation",
                description: "Event causing change of state",
                shortcut: ["M"],
            },
        ],
        instanceOfName: "Diagrams in",
        instanceTypes: [
            {
                tag: "ObType",
                obType: { tag: "Basic", content: "Object" },
                name: "Element",
                description: "State of the system",
                shortcut: ["O"],
            },
            {
                tag: "MorType",
                morType: {
                    tag: "Basic",
                    content: "Multihom",
                },
                name: "Operation",
                description: "Event causing change of state",
                shortcut: ["M"],
            },
        ],
        diagramAnalyses: diagramAnalyses,
    });
}
