import type * as Viz from "@viz-js/viz";
import { type Component, For, Show, createResource, createSignal } from "solid-js";

import type { DblModel } from "catlog-wasm";
import type { ModelAnalysisProps } from "../../analysis";
import { Foldable } from "../../components";
import type { ModelAnalysisMeta, Theory } from "../../theory";
import { uniqueIndexArray } from "../../util/indexing";
import {
    type ArrowMarker,
    DownloadSVGButton,
    EdgeSVG,
    type GraphLayout,
    GraphLayoutConfig,
    GraphLayoutConfigForm,
    type GraphvizAttributes,
    NodeSVG,
    type SVGRefProp,
    arrowMarkerSVG,
    loadViz,
    vizLayoutGraph,
} from "../../visualization";
import { modelToGraphviz } from "./model_graph";

import svgStyles from "../svg_styles.module.css";
import "./graph_visualization.css";

/** Configure a visualization of a stock flow diagram. */
export function configureStockFlowDiagram(options: {
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
        component: StockFlowDiagram,
        initialContent: GraphLayoutConfig.defaultConfig,
    };
}

/** Visualize a stock flow diagram. */
export function StockFlowDiagram(props: ModelAnalysisProps<GraphLayoutConfig.Config>) {
    // XXX: Following code is mostly copy-paste from `GraphVisualization`.
    const [svgRef, setSvgRef] = createSignal<SVGSVGElement>();

    const header = () => (
        <DownloadSVGButton svg={svgRef()} tooltip="Export the diagram as SVG" size={16} />
    );

    return (
        <div class="graph-visualization-container">
            <Foldable title="Visualization" header={header()}>
                <GraphLayoutConfigForm config={props.content} changeConfig={props.changeContent} />
            </Foldable>
            <div class="graph-visualization">
                <Show when={props.liveModel.elaboratedModel()}>
                    {(model) => (
                        <StockFlowGraphviz
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

/** Visualize a stock flow diagram using Graphviz plus custom layout.

First, Graphviz computes a layout for the stocks and flows. Then we add the
links from stocks to flows using our own layout heuristics.
 */
export function StockFlowGraphviz(props: {
    model: DblModel;
    theory?: Theory;
    options?: Viz.RenderOptions;
    ref?: SVGRefProp;
}) {
    const [vizResource] = createResource(loadViz);

    const vizLayout = () => {
        const viz = vizResource();
        if (props.theory && viz) {
            return vizLayoutGraph(
                viz,
                modelToGraphviz(props.model, props.theory, stockFlowAttributes),
                props.options,
            );
        }
    };

    return <StockFlowSVG model={props.model} layout={vizLayout()} ref={props.ref} />;
}

const stockFlowAttributes: GraphvizAttributes = {
    graph: {
        splines: "ortho",
    },
    node: {
        width: 0.55,
        height: 0.55,
    },
};

function StockFlowSVG(props: {
    model: DblModel;
    layout?: GraphLayout.Graph<string>;
    ref?: SVGRefProp;
}) {
    // Path element used only for computation. Not added to the DOM.
    const pathElem = document.createElementNS("http://www.w3.org/2000/svg", "path");

    const linkPaths = () => {
        const result: string[] = [];
        const model = props.model;
        const nodeMap = uniqueIndexArray(props.layout?.nodes ?? [], (node) => node.id);
        const edgeMap = uniqueIndexArray(props.layout?.edges ?? [], (edge) => edge.id);
        for (const id of model.morGenerators()) {
            const [dom, cod] = [model.getDom(id), model.getCod(id)];
            if (
                !(dom?.tag === "Basic" && cod?.tag === "Tabulated" && cod.content.tag === "Basic")
            ) {
                continue;
            }
            const [srcId, tgtId] = [dom.content, cod.content.content];
            const [srcNode, tgtEdge] = [nodeMap.get(srcId), edgeMap.get(tgtId)];
            if (!srcNode || !tgtEdge) {
                continue;
            }
            pathElem.setAttribute("d", tgtEdge.path);
            const midpoint = pathElem.getPointAtLength(pathElem.getTotalLength() / 2);
            const path = quadraticCurve(srcNode.pos, midpoint, 1.0);
            result.push(path.join(" "));
        }
        return result;
    };

    const linkClass = ["edge", svgStyles["link"]].join(" ");
    return (
        <svg
            ref={props.ref}
            class="graph stock-flow"
            width={props.layout?.width}
            height={props.layout?.height}
        >
            <defs>
                <FlowMarker />
                <LinkMarker />
            </defs>
            <For each={props.layout?.edges ?? []}>{(edge) => <EdgeSVG edge={edge} />}</For>
            <For each={linkPaths()}>
                {(data) => (
                    <g class={linkClass}>
                        <path marker-end={`url(#arrowhead-${linkMarker})`} d={data} />
                    </g>
                )}
            </For>
            <For each={props.layout?.nodes ?? []}>{(node) => <NodeSVG node={node} />}</For>
        </svg>
    );
}

/** Quadratic Bezier curve from one point to another.
 */
function quadraticCurve(src: GraphLayout.Point, tgt: GraphLayout.Point, ratio: number) {
    const vec = { x: tgt.x - src.x, y: tgt.y - src.y };
    const mid = { x: (src.x + tgt.x) / 2, y: (src.y + tgt.y) / 2 };
    const ctrl = { x: mid.x + ratio * vec.y, y: mid.y - ratio * vec.x };
    return ["M", src.x, src.y, "Q", ctrl.x, `${ctrl.y},`, tgt.x, tgt.y];
}

const flowMarker: ArrowMarker = "double";
const linkMarker: ArrowMarker = "vee";

const FlowMarker: Component = arrowMarkerSVG[flowMarker];
const LinkMarker: Component = arrowMarkerSVG[linkMarker];
