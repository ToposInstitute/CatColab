import type * as Viz from "@viz-js/viz";
import { For, createResource } from "solid-js";

import type { ModelJudgment } from "../../model";
import type { TheoryMeta } from "../../theory";
import { uniqueIndexArray } from "../../util/indexing";
import {
    type ArrowMarker,
    EdgeSVG,
    type GraphLayout,
    NodeSVG,
    arrowMarkerSVG,
    loadViz,
    vizLayoutGraph,
} from "../../visualization";
import { modelToGraphviz } from "./model_graph";

/** Visualize a stock flow diagram.

First, Graphviz computes a layout for the stocks and flows. Then we add the
links from stocks to flows using our own layout heuristics.
 */
export function StockFlowDiagram(props: {
    model: Array<ModelJudgment>;
    theory: TheoryMeta;
    vizOptions?: Viz.RenderOptions;
}) {
    const [vizResource] = createResource(loadViz);

    const vizLayout = () => {
        const viz = vizResource();
        return (
            viz && vizLayoutGraph(viz, modelToGraphviz(props.model, props.theory), props.vizOptions)
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
            if (
                // XXX: Pattern matching would help here.
                judgment.tag === "morphism" &&
                judgment.dom?.tag === "Basic" &&
                judgment.cod?.tag === "Tabulated" &&
                judgment.cod.content.tag === "Basic"
            ) {
                const srcNode = nodeMap.get(judgment.dom.content);
                const tgtEdge = edgeMap.get(judgment.cod.content.content);
                if (!srcNode || !tgtEdge) {
                    continue;
                }
                pathElem.setAttribute("d", tgtEdge.path);
                const mid = pathElem.getPointAtLength(pathElem.getTotalLength() / 2);
                const path = ["M", srcNode.pos.x, srcNode.pos.y, "L", mid.x, mid.y];
                result.push(path.join(" "));
            }
        }
        return result;
    };

    return (
        <svg class="graph stock-flow" width={props.layout?.width} height={props.layout?.height}>
            <defs>
                {arrowMarkerSVG[flowMarker]}
                {arrowMarkerSVG[linkMarker]}
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

const flowMarker: ArrowMarker = "double";
const linkMarker: ArrowMarker = "vee";
