import type * as Viz from "@viz-js/viz";
import { Show, createSignal } from "solid-js";

import type { DblModel, QualifiedName } from "catlog-wasm";
import type { ModelAnalysisProps } from "../../analysis";
import { Foldable } from "../../components";
import type { ModelAnalysisMeta, Theory } from "../../theory";
import {
    DownloadSVGButton,
    GraphLayoutConfig,
    GraphLayoutConfigForm,
    type GraphvizAttributes,
    GraphvizSVG,
    type SVGRefProp,
} from "../../visualization";
import * as GV from "./graph_visualization";

import "./graph_visualization.css";

/** Configure a graph visualization for use with models of a double theory. */
export function configureModelGraph(options: {
    id: string;
    name: string;
    description?: string;
    help?: string;
}): ModelAnalysisMeta<GraphLayoutConfig.Config> {
    const { id, name, description, help } = options;
    return {
        id,
        name,
        description,
        help,
        component: (props) => <ModelGraph title={name} {...props} />,
        initialContent: GraphLayoutConfig.defaultConfig,
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
    } & ModelAnalysisProps<GraphLayoutConfig.Config>,
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
                <GraphLayoutConfigForm config={props.content} changeConfig={props.changeContent} />
            </Foldable>
            <div class="graph-visualization">
                <Show when={props.liveModel.elaboratedModel()}>
                    {(model) => (
                        <ModelGraphviz
                            model={model()}
                            theory={props.liveModel.theory()}
                            options={GraphLayoutConfig.graphvizOptions(props.content)}
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
    model: DblModel;
    theory?: Theory;
    obGenerators?: QualifiedName[];
    morGenerators?: QualifiedName[];
    attributes?: GraphvizAttributes;
    options?: Viz.RenderOptions;
    ref?: SVGRefProp;
}) {
    return (
        <Show when={props.theory}>
            {(theory) => (
                <GraphvizSVG
                    graph={modelToGraphviz(
                        props.model,
                        theory(),
                        props.attributes,
                        props.obGenerators,
                        props.morGenerators,
                    )}
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
    model: DblModel,
    theory: Theory,
    attributes?: GraphvizAttributes,
    obGenerators?: QualifiedName[],
    morGenerators?: QualifiedName[],
): Viz.Graph {
    const nodes: Required<Viz.Graph>["nodes"] = [];
    for (const id of obGenerators ?? model.obGenerators()) {
        const obType = model.obType({ tag: "Basic", content: id });
        const meta = theory.modelObTypeMeta(obType);
        nodes.push({
            name: id,
            attributes: {
                id,
                label: model.obGeneratorLabel(id)?.join(".") ?? "",
                class: GV.svgCssClasses(meta).join(" "),
                fontname: GV.graphvizFontname(meta),
            },
        });
    }

    const edges: Required<Viz.Graph>["edges"] = [];
    for (const id of morGenerators ?? model.morGenerators()) {
        const [dom, cod] = [model.getDom(id), model.getCod(id)];
        if (!(dom?.tag === "Basic" && cod?.tag === "Basic")) {
            continue;
        }
        const morType = model.morType({ tag: "Basic", content: id });
        const meta = theory.modelMorTypeMeta(morType);
        edges.push({
            head: cod.content,
            tail: dom.content,
            attributes: {
                id: id,
                label: model.morGeneratorLabel(id)?.join(".") ?? "",
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
