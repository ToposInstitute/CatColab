import type * as Viz from "@viz-js/viz";
import { type Component, For, Show, createResource, createSignal } from "solid-js";
import { P, match } from "ts-pattern";

import type { ModelJudgment } from "catlog-wasm";
import type { ModelAnalysisProps } from "../../analysis";
import { Foldable } from "../../components";
import type { ModelAnalysisMeta, Theory } from "../../theory";
import { uniqueIndexArray } from "../../util/indexing";
import {
    type ArrowMarker,
    DownloadSVGButton,
    EdgeSVG,
    type GraphLayout,
    NodeSVG,
    type SVGRefProp,
    arrowMarkerSVG,
    loadViz,
    vizLayoutGraph,
} from "../../visualization";
import * as GV from "./graph_visualization";
import { modelToGraphviz } from "./model_graph";

import "./graph_visualization.css";

/** Configure a visualization of a stock flow diagram. */
export function configureStockFlowDiagram(options: {
    id: string;
    name: string;
    description?: string;
}): ModelAnalysisMeta<GV.GraphConfig> {
    const { id, name, description } = options;
    return {
        id,
        name,
        description,
        component: StockFlowDiagram,
        initialContent: GV.defaultGraphConfig,
    };
}

const STOCKFLOW_ATTRIBUTES: GV.GraphvizAttributes = {
    graph: {
        splines: "ortho",
    },
    node: {
        width: 0.55,
        height: 0.55,
    },
};

/** Visualize a stock flow diagram.
 */
export function StockFlowDiagram(props: ModelAnalysisProps<GV.GraphConfig>) {
    const [svgRef, setSvgRef] = createSignal<SVGSVGElement>();

    const header = () => (
        <DownloadSVGButton svg={svgRef()} tooltip="Export the diagram as SVG" size={16} />
    );

    return (
        <div class="graph-visualization-analysis">
            <Foldable title="Visualization" header={header()}>
                <GV.GraphConfigForm content={props.content} changeContent={props.changeContent} />
            </Foldable>
            <div class="graph-visualization">
                <Show when={props.liveModel.theory()}>
                    {(theory) => (
                        <StockFlowGraphviz
                            model={props.liveModel.formalJudgments()}
                            theory={theory()}
                            options={GV.graphvizOptions(props.content)}
                            attributes={STOCKFLOW_ATTRIBUTES}
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
    model: Array<ModelJudgment>;
    theory: Theory;
    attributes?: GV.GraphvizAttributes;
    options?: Viz.RenderOptions;
    ref?: SVGRefProp;
}) {
    const [vizResource] = createResource(loadViz);

    const vizLayout = () => {
        const viz = vizResource();
        const patternAuxiliaryVariable: P.Pattern<ModelJudgment> = {
            tag: "object",
            obType: {
                content: "AuxiliaryVariable",
                tag: "Basic",
            },
        };
        return (
            viz &&
            vizLayoutGraph(
                viz,
                modelToGraphviz(
                    props.model,
                    props.theory,
                    props.attributes,
                    (jgmt: ModelJudgment) =>
                        match(jgmt)
                            .with(patternAuxiliaryVariable, () => ({
                                xlabel: jgmt.name,
                                label: "",
                            }))
                            .with(P._, () => undefined)
                            .run(),
                ),
                props.options,
            )
        );
    };

    return <StockFlowSVG model={props.model} layout={vizLayout()} ref={props.ref} />;
}

function StockFlowSVG(props: {
    model: Array<ModelJudgment>;
    layout?: GraphLayout.Graph<string>;
    ref?: SVGRefProp;
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
                    const path = quadraticCurve(srcNode.pos, midpoint, 1.0);
                    result.push(path.join(" "));
                },
            );
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
