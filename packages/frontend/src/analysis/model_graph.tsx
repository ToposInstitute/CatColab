import type * as Viz from "@viz-js/viz";

import type { ModelJudgment } from "../model";
import type { ModelAnalysisMeta, Theory, TypeMeta } from "../theory";
import { GraphvizSVG } from "../visualization";
import type { ModelAnalysisProps, ModelGraphContent } from "./types";

import styles from "../stdlib/styles.module.css";

/** Configure a graph visualization for use with models of a double theory. */
export function configureModelGraph(options: {
    id: string;
    name: string;
    description?: string;
}): ModelAnalysisMeta<ModelGraphContent> {
    const { id, name, description } = options;
    return {
        id,
        name,
        description,
        component: (props) => <ModelGraph title={name} {...props} />,
        initialContent: () => ({
            tag: "graph",
            layout: "graphviz-directed",
        }),
    };
}

/** Visualize a model of a double theory as a graph.

Such a visualization makes sense for any discrete double theory since the
generators of such a model are just a typed graph. For other kinds of double
theories, any basic morphism whose domain or codomain is not a basic object will
be ignored.

For now, the layout of the graph is computed by Graphviz. Other layout engines
may be added in the future.
 */
export function ModelGraph(
    props: {
        title?: string;
    } & ModelAnalysisProps<ModelGraphContent>,
) {
    return (
        <div class="model-graph">
            <div class="panel">
                <span class="title">{props.title}</span>
            </div>
            <ModelGraphviz
                model={props.model}
                theory={props.theory}
                options={{
                    engine: graphvizEngine(props.content.layout),
                }}
            />
        </div>
    );
}

export function graphvizEngine(layout: ModelGraphContent["layout"]) {
    let engine!: Viz.RenderOptions["engine"];
    if (layout === "graphviz-directed") {
        engine = "dot";
    } else if (layout === "graphviz-undirected") {
        engine = "neato";
    }
    return engine;
}

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
