import type * as Viz from "@viz-js/viz";

import { TheoryMeta, TypeMeta } from "../theory";
import { isoObjectId, isoMorphismId, ModelNotebook } from "./types";

import styles from "../theory/styles.module.css";


/** Visualize a model of a discrete double theory as a graph.

Such a visualization makes sense for any discrete double theory since the
generators of such a model are just a typed graph. For a general double theory,
there is no single recipe to visualize its models.

FIXME: Should take a generic model object, not the notebook-specific one.
 */
export function modelToGraphviz(
    model: ModelNotebook,
    theory: TheoryMeta,
    attributes?: {
        graph?: {[name: string]: any};
        node?: {[name: string]: any};
        edge?: {[name: string]: any};
    },
): Viz.Graph {
    const nodes = [];
    const edges = [];
    for (const cell of model.notebook.cells) {
        if (cell.tag !== "formal") { continue; }
        const judgment = cell.content;

        if (judgment.tag === "object") {
            const { id, name } = judgment;
            const meta = theory.types.get(judgment.type);
            nodes.push({
                name: isoObjectId.unwrap(id),
                attributes: {
                    id: isoObjectId.unwrap(id),
                    label: name,
                    class: meta?.textClasses?.join(" ") ?? "",
                    fontname: fontname(meta),
                },
            });
        } else if (judgment.tag === "morphism") {
            const { id, name, dom, cod } = judgment;
            if (!dom || !cod) { continue; }
            const meta = theory.types.get(judgment.type);
            edges.push({
                head: isoObjectId.unwrap(cod),
                tail: isoObjectId.unwrap(dom),
                attributes: {
                    id: isoMorphismId.unwrap(id),
                    label: name,
                    class: meta?.textClasses?.join(" ") ?? "",
                    fontname: fontname(meta),
                }
            });
        }
    }

    return {
        directed: true,
        nodes,
        edges,
        graphAttributes: attributes?.graph,
        nodeAttributes: {...defaultNodeAttributes, ...attributes?.node},
        edgeAttributes: {...defaultEdgeAttributes, ...attributes?.edge},
    };
}

// XXX: Precise font matching seems impossible here but we'll at least give
// Graphviz a monospace font if and only if we're using one.
const fontname = (meta?: TypeMeta) =>
    meta?.textClasses?.includes(styles.code) ? "Courier" : "Helvetica";

const defaultNodeAttributes = {
    // FIXME: How to set the font size?
    fontsize: "20",
    shape: "box",
    width: 0,
    height: 0,
};

const defaultEdgeAttributes = {
    fontsize: "20",
    sep: "5",
};
