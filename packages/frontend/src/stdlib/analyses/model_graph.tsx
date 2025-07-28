import type * as Viz from "@viz-js/viz";
import { createSignal } from "solid-js";
import { P, match } from "ts-pattern";
import { createSignal, Show } from "solid-js";
import { match, P } from "ts-pattern";

import type { DblModelNext, ModelJudgment } from "catlaborator";
import type { ModelAnalysisProps } from "../../analysis";
import { Foldable } from "../../components";
import type { ModelAnalysisMeta, Theory } from "../../theory";
import { DownloadSVGButton, GraphvizSVG, type SVGRefProp } from "../../visualization";
import * as GV from "./graph_visualization";

import "./graph_visualization.css";

/** Configure a graph visualization for use with models of a double theory. */
export function configureModelGraph(options: {
    id: string;
    name: string;
    description?: string;
    help?: string;
}): ModelAnalysisMeta<GV.GraphConfig> {
    const { id, name, description, help } = options;
    return {
        id,
        name,
        description,
        help,
        component: (props) => <ModelGraph title={name} {...props} />,
        initialContent: GV.defaultGraphConfig,
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
    } & ModelAnalysisProps<GV.GraphConfig>,
) {
    const [svgRef, setSvgRef] = createSignal<SVGSVGElement>();

    const title = () => props.title ?? "Graph";
    const header = () => (
        <DownloadSVGButton
            svg={svgRef()}
            tooltip={`Export the ${title().toLowerCase()} as SVG`}
            size={16}
        />
    );

    return (
        <div class="graph-visualization-analysis">
            <Foldable title={title()} header={header()}>
                <GV.GraphConfigForm content={props.content} changeContent={props.changeContent} />
            </Foldable>
            <div class="graph-visualization">
                <Show when={props.liveModel.theory()}>
                    {(theory) => (
                        <ModelGraphviz
                            model={props.liveModel.validatedModelNext()}
                            theory={theory()}
                            options={GV.graphvizOptions(props.content)}
                            ref={setSvgRef}
                        />
                    )}
                </Show>
            </div>
        </div>
    );
}

/** Visualize a model of a double theory as a graph using Graphviz.
 */
export function ModelGraphviz(props: {
    model: DblModelNext | undefined;
    theory: Theory;
    attributes?: GV.GraphvizAttributes;
    options?: Viz.RenderOptions;
    ref?: SVGRefProp;
}) {
    return (
        <Show when={props.model}>
            {(model) => (
                <GraphvizSVG
                    graph={modelToGraphviz(model(), props.theory, props.attributes)}
                    options={props.options}
                    ref={props.ref}
                />
            )}
        </Show>
    );
}

/** Convert a model of a double theory into a Graphviz graph.
 */
export function modelToGraphviz(
    model: DblModelNext,
    theory: Theory,
    attributes?: GV.GraphvizAttributes,
): Viz.Graph {
    const nodes = new Map<string, Required<Viz.Graph>["nodes"][0]>();
    for (const ob of model.ob_generators()) {
        const meta = theory.modelObTypeMeta(ob.ob_type);
        nodes.set(ob.name, {
            name: ob.name,
            attributes: {
                id: ob.name,
                label: ob.name,
                class: GV.svgCssClasses(meta).join(" "),
                fontname: GV.graphvizFontname(meta),
            },
        });
    }

    const edges: Required<Viz.Graph>["edges"] = [];
    for (const mor of model.mor_generators()) {
        const meta = theory.modelMorTypeMeta(mor.mor_type);
        edges.push({
            head: mor.dom,
            tail: mor.cod,
            attributes: {
                id: mor.name,
                label: mor.name,
                class: GV.svgCssClasses(meta).join(" "),
                fontname: GV.graphvizFontname(meta),
                // Not recognized by Graphviz but will be passed through!
                arrowstyle: meta?.arrowStyle ?? "default",
            },
        });
    }

    return {
        directed: true,
        nodes,
        edges,
        graphAttributes: { ...GV.defaultGraphAttributes, ...attributes?.graph },
        nodeAttributes: { ...GV.defaultNodeAttributes, ...attributes?.node },
        edgeAttributes: { ...GV.defaultEdgeAttributes, ...attributes?.edge },
    };
}
