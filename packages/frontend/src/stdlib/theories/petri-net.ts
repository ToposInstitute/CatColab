import { lazy } from "solid-js";

import { ThSymMonoidalCategory } from "catlog-wasm";
import { Theory, type TheoryMeta } from "../../theory";
import { MorTypeMap } from "../../theory/types";

const ObjectCellEditor = lazy(() => import("../../model/object_cell_editor"));
const MorphismCellEditor = lazy(() => import("../../model/morphism_cell_editor"));

export default function createPetriNetTheory(theoryMeta: TheoryMeta): Theory {
    const thSymMonoidalCategory = new ThSymMonoidalCategory();

    return new Theory({
        ...theoryMeta,
        theory: thSymMonoidalCategory.theory(),
        onlyFreeModels: true,
        editorVariants: {
            defaultLabel: "List transitions",
            variants: [
                {
                    id: "editor-variant-petri-net-string-diagram",
                    label: "String diagram transitions",
                    editorOverrides: {
                        morEditors: new MorTypeMap([
                            [
                                {
                                    tag: "Hom" as const,
                                    content: { tag: "Basic" as const, content: "Object" },
                                },
                                lazy(
                                    () => import("../../model/string_diagram_morphism_cell_editor"),
                                ),
                            ],
                        ]),
                    },
                },
            ],
        },
        modelTypes: [
            {
                tag: "ObType",
                obType: { tag: "Basic", content: "Object" },
                editor: ObjectCellEditor,
                name: "Place",
                description: "State of the system",
                shortcut: ["O"],
            },
            {
                tag: "MorType",
                morType: {
                    tag: "Hom",
                    content: { tag: "Basic", content: "Object" },
                },
                editor: MorphismCellEditor,
                name: "Transition",
                description: "Event causing change of state",
                shortcut: ["M"],
                domain: {
                    apply: { tag: "Basic", content: "tensor" },
                },
                codomain: {
                    apply: { tag: "Basic", content: "tensor" },
                },
            },
        ],
    });
}
