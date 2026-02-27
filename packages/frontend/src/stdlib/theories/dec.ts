import { ThDEC } from "catlog-wasm";
import { Theory, type TheoryMeta } from "../../theory";

export default function createThDECTheory(theoryMeta: TheoryMeta): Theory {
    const thDEC = new ThDEC();

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
                // domain: {
                //     apply: { tag: "Basic", content: "tensor" },
                // },
                // codomain: {
                //     apply: { tag: "Basic", content: "tensor" },
                // },
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
    });
}
