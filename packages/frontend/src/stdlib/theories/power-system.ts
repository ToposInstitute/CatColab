import { lazy } from "solid-js";

import { ThPowerSystem } from "catlog-wasm";
import { Theory, type TheoryMeta } from "../../theory";

const ObjectCellEditor = lazy(() => import("../../model/object_cell_editor"));
const MorphismCellEditor = lazy(() => import("../../model/morphism_cell_editor"));

export default function createPowerSystemsTheory(theoryMeta: TheoryMeta): Theory {
    const thPowerSystem = new ThPowerSystem();

    return new Theory({
        ...theoryMeta,
        theory: thPowerSystem.theory(),
        onlyFreeModels: true,
        modelTypes: [
            {
                tag: "ObType",
                obType: { tag: "Basic", content: "Bus" },
                editor: ObjectCellEditor,
                name: "Bus",
                description: "Node in the power system",
                shortcut: ["B"],
            },
            {
                tag: "MorType",
                morType: {
                    tag: "Hom",
                    content: { tag: "Basic", content: "Bus" },
                },
                editor: MorphismCellEditor,
                name: "Line",
                description: "Passive line between buses",
                arrowStyle: "unmarked",
                preferUnnamed: true,
                shortcut: ["L"],
            },
            {
                tag: "MorType",
                morType: { tag: "Basic", content: "Passive" },
                editor: MorphismCellEditor,
                name: "Transformer",
                description: "Passive line allowing a change of voltage",
                arrowStyle: "unmarked",
                preferUnnamed: true,
            },
            {
                tag: "MorType",
                morType: { tag: "Basic", content: "Branch" },
                editor: MorphismCellEditor,
                name: "Link",
                description: "Controllable flow between buses",
                arrowStyle: "unmarked",
                preferUnnamed: true,
            },
        ],
    });
}
