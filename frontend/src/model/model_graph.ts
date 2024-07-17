import type * as Viz from "@viz-js/viz";

import { isoObjectId, isoMorphismId, ModelNotebook } from "./types";


export function modelToGraph(model: ModelNotebook): Viz.Graph {
    const nodes = [];
    const edges = [];
    for (const cell of model.notebook.cells) {
        if (cell.tag !== "formal") {
            continue;
        }
        const judgment = cell.content;
        if (judgment.tag === "object") {
            const { id, name } = judgment;
            nodes.push({
                name: isoObjectId.unwrap(id),
                attributes: {
                    id: isoObjectId.unwrap(id),
                    label: name,
                    shape: "rect",
                },
            });
        } else if (judgment.tag === "morphism") {
            const { id, name, dom, cod } = judgment;
            if (!dom || !cod) {
                continue;
            }
            edges.push({
                head: isoObjectId.unwrap(dom),
                tail: isoObjectId.unwrap(cod),
                attributes: {
                    id: isoMorphismId.unwrap(id),
                    label: name,
                }
            });
        }
    }
    return {
        directed: true,
        nodes,
        edges,
        // FIXME: How to set these font sizes?
        nodeAttributes: {
            fontsize: "20",
        },
        edgeAttributes: {
            fontsize: "20",
        }
    };
}
