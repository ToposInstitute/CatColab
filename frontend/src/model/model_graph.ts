import type * as Viz from "@viz-js/viz";

import type { TheoryMeta, TypeMeta } from "../theory";
import type { ModelNotebook } from "./types";

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
        graph?: { [name: string]: any };
        node?: { [name: string]: any };
        edge?: { [name: string]: any };
    },
): Viz.Graph {
    const nodes = [];
    const edges = [];
    for (const cell of model.notebook.cells) {
        if (cell.tag !== "formal") {
            continue;
        }
        const judgment = cell.content;

        if (judgment.tag === "object") {
            const { id, name } = judgment;
            const meta = theory.getObTypeMeta(judgment.obType);
            nodes.push({
                name: id,
                attributes: {
                    id,
                    label: name,
                    class: cssClass(meta),
                    fontname: fontname(meta),
                },
            });
        } else if (judgment.tag === "morphism") {
            const { id, name, dom, cod } = judgment;
            if (!dom || !cod) {
                continue;
            }
            const meta = theory.getMorTypeMeta(judgment.morType);
            edges.push({
                head: cod,
                tail: dom,
                attributes: {
                    id,
                    label: name,
                    class: cssClass(meta),
                    fontname: fontname(meta),
                    // Not recognized by Graphviz but will be passed through!
                    arrowstyle: meta?.arrowStyle ?? "to",
                },
            });
        }
    }

    return {
        directed: true,
        nodes,
        edges,
        graphAttributes: attributes?.graph,
        nodeAttributes: { ...defaultNodeAttributes, ...attributes?.node },
        edgeAttributes: { ...defaultEdgeAttributes, ...attributes?.edge },
    };
}

const cssClass = (meta?: TypeMeta): string =>
    [...(meta?.svgClasses ?? []), ...(meta?.textClasses ?? [])].join(" ");

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
