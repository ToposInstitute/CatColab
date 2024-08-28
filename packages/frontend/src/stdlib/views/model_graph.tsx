import type * as Viz from "@viz-js/viz";

import type { ModelJudgment, ModelViewProps } from "../../model";
import type { ModelViewMeta, Theory, TypeMeta } from "../../theory";
import { GraphvizSVG } from "../../visualization";

import styles from "../styles.module.css";

/** Configure a graph view for use with models of a double theory. */
export function configureModelGraph(options: {
    id: string;
    name: string;
    description?: string;
}): ModelViewMeta<ModelGraphViewContent> {
    const { id, name, description } = options;
    return {
        id,
        name,
        description,
        component: ModelGraphView,
        initialContent: () => ({
            layout: "graphviz-directed",
        }),
    };
}

/** Visualize a model of a double theory as a graph.

Such a visualization makes sense for any discrete double theory since the
generators of such a model are just a typed graph. For other kinds of double
theories, any basic morphism whose domain or codomain is not a basic object will
be ignored.

For now, Graphviz computes the layout of the graph. Other layout engines may be
added in the future.
 */
export function ModelGraphView(props: ModelViewProps<ModelGraphViewContent>) {
    return (
        <ModelGraphviz
            model={props.model}
            theory={props.theory}
            options={{
                engine: props.content.layout === "graphviz-directed" ? "dot" : "neato",
            }}
        />
    );
}

/** Configuration for a graph view of a model. */
export type ModelGraphViewContent = {
    layout: "graphviz-directed" | "graphviz-undirected";
};

/** Visualize a model of a double theory as a graph using Graphviz.
 */
export function ModelGraphviz(props: {
    model: Array<ModelJudgment>;
    theory: Theory;
    attributes?: GraphvizAttributes;
    options?: Viz.RenderOptions;
}) {
    return (
        <GraphvizSVG
            graph={modelToGraphviz(props.model, props.theory, props.attributes)}
            options={props.options}
        />
    );
}

/** Convert a model of a double theory into a Graphviz graph.
 */
export function modelToGraphviz(
    model: Array<ModelJudgment>,
    theory: Theory,
    attributes?: GraphvizAttributes,
): Viz.Graph {
    const nodes = [];
    const edges = [];
    for (const judgment of model) {
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
            if (!(dom?.tag === "Basic" && cod?.tag === "Basic")) {
                continue;
            }
            const meta = theory.getMorTypeMeta(judgment.morType);
            edges.push({
                head: cod.content,
                tail: dom.content,
                attributes: {
                    id,
                    label: name,
                    class: cssClass(meta),
                    fontname: fontname(meta),
                    // Not recognized by Graphviz but will be passed through!
                    arrowstyle: meta?.arrowStyle ?? "default",
                },
            });
        }
    }
    return {
        directed: true,
        nodes,
        edges,
        graphAttributes: { ...defaultGraphAttributes, ...attributes?.graph },
        nodeAttributes: { ...defaultNodeAttributes, ...attributes?.node },
        edgeAttributes: { ...defaultEdgeAttributes, ...attributes?.edge },
    };
}

/** Top-level attributes of a Graphviz graph. */
export type GraphvizAttributes = {
    graph?: Viz.Graph["graphAttributes"];
    node?: Viz.Graph["nodeAttributes"];
    edge?: Viz.Graph["edgeAttributes"];
};

const cssClass = (meta?: TypeMeta): string =>
    [...(meta?.svgClasses ?? []), ...(meta?.textClasses ?? [])].join(" ");

// XXX: Precise font matching seems impossible here but we'll at least give
// Graphviz a monospace font if and only if we're using one.
const fontname = (meta?: TypeMeta) =>
    meta?.textClasses?.includes(styles.code) ? "Courier" : "Helvetica";

const defaultGraphAttributes = {
    nodesep: "0.5",
};

const defaultNodeAttributes = {
    // XXX: How to set the font size?
    fontsize: "20",
    shape: "box",
    width: 0,
    height: 0,
};

const defaultEdgeAttributes = {
    fontsize: "20",
    sep: "5",
};
