import type * as Viz from "@viz-js/viz";
import { Show, createSignal } from "solid-js";

import { type DblModel, type Uuid, collectProduct } from "catlaborator";
import type { ModelAnalysisProps } from "../../analysis";
import { Foldable } from "../../components";
import type { ModelAnalysisMeta } from "../../theory";
import { DownloadSVGButton, GraphvizSVG, type SVGRefProp } from "../../visualization";
import * as GV from "./graph_visualization";

import svgStyles from "../svg_styles.module.css";
import "./graph_visualization.css";

/** Configure a visualization of a Petri net. */
export function configurePetriNetVisualization(options: {
    id: string;
    name: string;
    description?: string;
}): ModelAnalysisMeta<GV.GraphConfig> {
    const { id, name, description } = options;
    return {
        id,
        name,
        description,
        component: PetriNetVisualization,
        initialContent: GV.defaultGraphConfig,
    };
}

/** Visualize a Petri net. */
export function PetriNetVisualization(props: ModelAnalysisProps<GV.GraphConfig>) {
    const [svgRef, setSvgRef] = createSignal<SVGSVGElement>();

    const header = () => (
        <DownloadSVGButton svg={svgRef()} tooltip="Export Petri net as SVG" size={16} />
    );

    return (
        <div class="graph-visualization-analysis">
            <Foldable title="Visualization" header={header()}>
                <GV.GraphConfigForm content={props.content} changeContent={props.changeContent} />
            </Foldable>
            <div class="graph-visualization">
                <Show when={props.liveModel.validatedModel()?.model}>
                    {(model) => (
                        <PetriNetGraphviz
                            model={model()}
                            objectIndex={props.liveModel.objectIndex().map}
                            morphismIndex={props.liveModel.morphismIndex().map}
                            options={GV.graphvizOptions(props.content)}
                            ref={setSvgRef}
                        />
                    )}
                </Show>
            </div>
        </div>
    );
}

/** Visualize a Petri net using Graphviz. */
export function PetriNetGraphviz(props: {
    model: DblModel;
    objectIndex?: Map<Uuid, string>;
    morphismIndex?: Map<Uuid, string>;
    options?: Viz.RenderOptions;
    ref?: SVGRefProp;
}) {
    return (
        <GraphvizSVG
            graph={petriNetToGraphviz(props.model, props.objectIndex, props.morphismIndex)}
            options={props.options}
            ref={props.ref}
        />
    );
}

/** Convert a Petri net into a Graphviz graph.

Both the places and the transitions become nodes in the graph.
 */
export function petriNetToGraphviz(
    model: DblModel,
    objectIndex?: Map<Uuid, string>,
    morphismIndex?: Map<Uuid, string>,
): Viz.Graph {
    // Add nodes for places.
    const nodes: Required<Viz.Graph>["nodes"] = [];
    const objectIds = model
        .objects()
        .filter((ob) => ob.tag === "Basic")
        .map((ob) => ob.content);
    objectIds.sort();
    for (const id of objectIds) {
        nodes.push({
            name: id,
            attributes: {
                id,
                label: objectIndex?.get(id) ?? "",
                class: svgStyles["place"],
                width: "0.5",
                height: "0.5",
            },
        });
    }

    /// Add nodes for transitions and edges for arcs.
    const edges: Required<Viz.Graph>["edges"] = [];
    const morphismIds = model
        .morphisms()
        .filter((mor) => mor.tag === "Basic")
        .map((mor) => mor.content);
    morphismIds.sort();
    for (const id of morphismIds) {
        nodes.push({
            name: id,
            attributes: {
                id,
                label: morphismIndex?.get(id) ?? "",
                class: svgStyles["transition"],
                width: "1",
                height: "0.25",
            },
        });

        const [dom, cod] = [model.getDom(id), model.getCod(id)];
        for (const ob of dom ? collectProduct(dom) : []) {
            if (ob.tag !== "Basic") {
                continue;
            }
            edges.push({
                head: id,
                tail: ob.content,
            });
        }
        for (const ob of cod ? collectProduct(cod) : []) {
            if (ob.tag !== "Basic") {
                continue;
            }
            edges.push({
                head: ob.content,
                tail: id,
            });
        }
    }

    return {
        directed: true,
        nodes,
        edges,
        graphAttributes: {
            ...GV.defaultGraphAttributes,
            fontname: "Helvetica",
        },
        nodeAttributes: GV.defaultNodeAttributes,
        edgeAttributes: GV.defaultEdgeAttributes,
    };
}
