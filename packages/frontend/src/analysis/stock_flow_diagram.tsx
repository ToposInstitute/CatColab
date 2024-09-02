import type * as Viz from "@viz-js/viz";
import { type Component, For, createResource } from "solid-js";
import { P, match } from "ts-pattern";

import type { ModelJudgment } from "../model";
import type { ModelAnalysisMeta, Theory } from "../theory";
import { uniqueIndexArray } from "../util/indexing";
import {
    type ArrowMarker,
    EdgeSVG,
    type GraphLayout,
    NodeSVG,
    arrowMarkerSVG,
    loadViz,
    vizLayoutGraph,
} from "../visualization";
import { type GraphvizAttributes, graphvizEngine, modelToGraphviz } from "./model_graph";
import type { ModelAnalysisProps, ModelGraphContent } from "./types";

/** Configure a visualization of a stock flow diagram. */
export function configureStockFlowDiagram(options: {
    id: string;
    name: string;
    description?: string;
}): ModelAnalysisMeta<ModelGraphContent> {
    const { id, name, description } = options;
    return {
        id,
        name,
        description,
        component: StockFlowDiagram,
        initialContent: () => ({
            tag: "graph",
            layout: "graphviz-directed",
        }),
    };
}

/** Visualize a stock flow diagram.
 */
export function StockFlowDiagram(props: ModelAnalysisProps<ModelGraphContent>) {
    return (
        <div class="model-graph">
            <div class="panel">
                <span class="title">Diagram</span>
            </div>
            <StockFlowGraphviz
                model={props.model}
                theory={props.theory}
                options={{
                    engine: graphvizEngine(props.content.layout),
                }}
            />
        </div>
    );
}

/** Visualize a stock flow diagram using Graphviz plus custom layout.

First, Graphviz computes a layout for the stocks and flows. Then we add the
links from stocks to flows using our own layout heuristics.
 */
export function StockFlowGraphviz(props: {
    model: Array<ModelJudgment>;
    theory: Theory;
    attributes?: GraphvizAttributes;
    options?: Viz.RenderOptions;
}) {
    const [vizResource] = createResource(loadViz);

    const vizLayout = () => {
        const viz = vizResource();
        return (
            viz &&
            vizLayoutGraph(
                viz,
                modelToGraphviz(props.model, props.theory, props.attributes),
                props.options,
            )
        );
    };

    return <StockFlowSVG model={props.model} layout={vizLayout()} />;
}

function StockFlowSVG(props: {
    model: Array<ModelJudgment>;
    layout?: GraphLayout.Graph<string>;
}) {
    // Path element used only for computation. Not added to the DOM.
    const pathElem = document.createElementNS("http://www.w3.org/2000/svg", "path");

    const linkPaths = () => {
        const result: string[] = [];
        const nodeMap = uniqueIndexArray(props.layout?.nodes ?? [], (node) => node.id);
        const edgeMap = uniqueIndexArray(props.layout?.edges ?? [], (edge) => edge.id);
        for (const judgment of props.model) {
            match(judgment).with(
                {
                    tag: "morphism",
                    dom: {
                        tag: "Basic",
                        content: P.select("srcId"),
                    },
                    cod: {
                        tag: "Tabulated",
                        content: {
                            tag: "Basic",
                            content: P.select("tgtId"),
                        },
                    },
                },
                ({ srcId, tgtId }) => {
                    const srcNode = nodeMap.get(srcId);
                    const tgtEdge = edgeMap.get(tgtId);
                    if (!srcNode || !tgtEdge) {
                        return;
                    }
                    pathElem.setAttribute("d", tgtEdge.path);
                    const midpoint = pathElem.getPointAtLength(pathElem.getTotalLength() / 2);
                    const path =
                        tgtEdge.source === srcId || tgtEdge.target === srcId
                            ? quadraticCurve(srcNode.pos, midpoint, 1.0)
                            : linearPath(srcNode.pos, midpoint);
                    result.push(path.join(" "));
                },
            );
        }
        return result;
    };

    return (
        <svg class="graph stock-flow" width={props.layout?.width} height={props.layout?.height}>
            <defs>
                <FlowMarker />
                <LinkMarker />
            </defs>
            <For each={props.layout?.edges ?? []}>{(edge) => <EdgeSVG edge={edge} />}</For>
            <For each={linkPaths()}>
                {(data) => (
                    <g class="edge link">
                        <path marker-end={`url(#arrowhead-${linkMarker})`} d={data} />
                    </g>
                )}
            </For>
            <For each={props.layout?.nodes ?? []}>{(node) => <NodeSVG node={node} />}</For>
        </svg>
    );
}

/** Linear path from one point to another.
 */
function linearPath(src: GraphLayout.Point, tgt: GraphLayout.Point) {
    return ["M", src.x, tgt.x, "L", tgt.x, tgt.y];
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
