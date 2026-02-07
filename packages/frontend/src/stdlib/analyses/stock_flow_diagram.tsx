import type * as Viz from "@viz-js/viz";
import { type Component, createResource, createSignal, For, Show } from "solid-js";

import { BlockTitle } from "catcolab-ui-components";
import type { DblModel } from "catlog-wasm";
import type { ModelAnalysisProps } from "../../analysis";
import type { Theory } from "../../theory";
import { uniqueIndexArray } from "../../util/indexing";
import {
    type ArrowMarker,
    type ArrowStyle,
    arrowMarkerSVG,
    DownloadSVGButton,
    EdgeSVG,
    type GraphLayout,
    GraphLayoutConfig,
    GraphLayoutConfigForm,
    type GraphvizAttributes,
    graphToViz,
    loadViz,
    NodeSVG,
    perpendicularLabelPosition,
    type SVGRefProp,
    vizLayoutGraph,
} from "../../visualization";
import svgStyles from "../svg_styles.module.css";
import { modelToGraph } from "./model_graph";
import "./graph_visualization.css";

/** Visualize a stock flow diagram. */
export default function StockFlowDiagram(props: ModelAnalysisProps<GraphLayoutConfig.Config>) {
    // XXX: Following code is mostly copy-paste from `GraphVisualization`.
    const [svgRef, setSvgRef] = createSignal<SVGSVGElement>();

    const header = () => (
        <DownloadSVGButton svg={svgRef()} tooltip="Export the diagram as SVG" size={16} />
    );

    return (
        <div class="graph-visualization-container">
            <BlockTitle
                title="Visualization"
                actions={header()}
                settingsPane={
                    <GraphLayoutConfigForm
                        config={props.content}
                        changeConfig={props.changeContent}
                    />
                }
            />
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
            const graph = modelToGraph(props.model, props.theory);
            return vizLayoutGraph(viz, graphToViz(graph, stockFlowAttributes), props.options);
        }
    };

    return (
        <StockFlowSVG
            model={props.model}
            theory={props.theory}
            layout={vizLayout()}
            ref={props.ref}
        />
    );
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
    theory?: Theory;
    layout?: GraphLayout.Graph;
    ref?: SVGRefProp;
}) {
    // Path element used only for computation. Not added to the DOM.
    const pathElem = document.createElementNS("http://www.w3.org/2000/svg", "path");

    const links = (): Array<{ path: string; arrowStyle?: ArrowStyle }> => {
        const result = [];
        const model = props.model;
        const nodeMap = uniqueIndexArray(props.layout?.nodes ?? [], (node) => node.id);
        const edgeMap = uniqueIndexArray(props.layout?.edges ?? [], (edge) => edge.id);
        for (const id of model.morGenerators()) {
            const mor = model.morPresentation(id);
            if (
                !(
                    mor &&
                    mor.dom.tag === "Basic" &&
                    mor.cod.tag === "Tabulated" &&
                    mor.cod.content.tag === "Basic"
                )
            ) {
                continue;
            }
            const [srcId, tgtId] = [mor.dom.content, mor.cod.content.content];
            const [srcNode, tgtEdge] = [nodeMap.get(srcId), edgeMap.get(tgtId)];
            if (!srcNode || !tgtEdge) {
                continue;
            }
            pathElem.setAttribute("d", tgtEdge.path);
            const midpoint = pathElem.getPointAtLength(pathElem.getTotalLength() / 2);
            const path = quadraticCurve(srcNode.pos, midpoint, 1.0);

            result.push({
                path: path.join(" "),
                arrowStyle: props.theory?.modelMorTypeMeta(mor.morType)?.arrowStyle,
            });
        }
        return result;
    };

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
            <For each={links()}>
                {(link) => <LinkSVG path={link.path} arrowStyle={link.arrowStyle} />}
            </For>
            <For each={props.layout?.nodes ?? []}>{(node) => <NodeSVG node={node} />}</For>
        </svg>
    );
}

/** Draw a link from a stock to a flow with optional +/- label. */
function LinkSVG(props: { path: string; arrowStyle?: ArrowStyle }) {
    const labelData = () => {
        let label: string;
        if (props.arrowStyle === "plus") {
            label = "+";
        } else if (props.arrowStyle === "minus") {
            label = "-";
        } else {
            return null;
        }

        // Path element used only for computation. Not added to the DOM.
        const pathElem = document.createElementNS("http://www.w3.org/2000/svg", "path");
        pathElem.setAttribute("d", props.path);
        const pathLength = pathElem.getTotalLength();

        // Get position at one third from the end
        const oneThird = pathElem.getPointAtLength(pathLength - pathLength / 3);
        // Get a nearby point to calculate direction vector
        const nearby = pathElem.getPointAtLength(pathLength - pathLength / 3 - 1);

        // Calculate position perpendicular to the direction
        const pos = perpendicularLabelPosition(nearby, oneThird);

        return {
            label,
            x: pos.x,
            y: pos.y,
        };
    };

    return (
        <g class={svgStyles["link"]}>
            <path marker-end={`url(#arrowhead-${linkMarker})`} d={props.path} />
            <Show when={labelData()}>
                {(data) => (
                    <text
                        class="label"
                        x={data().x}
                        y={data().y}
                        dominant-baseline="middle"
                        text-anchor="middle"
                    >
                        {data().label}
                    </text>
                )}
            </Show>
        </g>
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
