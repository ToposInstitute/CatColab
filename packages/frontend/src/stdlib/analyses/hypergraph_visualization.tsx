import { For, Index } from "solid-js";
import { Dynamic } from "solid-js/web";
import invariant from "tiny-invariant";

import { collectProduct, type DblModel } from "catlog-wasm";
import type { ModelAnalysisProps } from "../../analysis";
import {
    arrowMarkerSVG,
    type GraphLayout,
    type GraphLayoutConfig,
    type GraphSpec,
    NodeSVG,
    type SVGRefProp,
} from "../../visualization";
import { GraphVisualizationAnalysis } from "./graph_visualization";

import svgStyles from "../svg_styles.module.css";
import styles from "./hypergraph_visualization.module.css";

/** Visualize a directed hypergraph.

Each vertex is drawn once as a node. Each hyperedge is drawn as a closed curve
enclosing its incident vertices (and a small anchor placed by ELK). The
existing input/output arcs from the Levi-graph layout terminate inside the
curve, so their arrowheads land on the boundary, giving the directedness on
a per-vertex basis (an arrowhead pointing into the curve = input role; out of
the curve = output role; a vertex playing both roles gets two arrowheads).
 */
export default function HypergraphVisualization(
    props: ModelAnalysisProps<GraphLayoutConfig.Config>,
) {
    const result = () => {
        const model = props.liveModel.elaboratedModel();
        if (model) {
            return hypergraphFromModel(model);
        }
    };

    const renderer = (rProps: { graph: GraphLayout.Graph; ref?: SVGRefProp }) => (
        <HypergraphSVG
            graph={rProps.graph}
            hyperedgeIds={new Set(result()?.hyperedgeIds ?? [])}
            ref={rProps.ref}
        />
    );

    return (
        <GraphVisualizationAnalysis
            graph={result()?.graph}
            config={props.content}
            changeConfig={props.changeContent}
            renderer={renderer}
        />
    );
}

/** Render the laid-out Levi graph with hyperedge anchors replaced by hulls. */
function HypergraphSVG(props: {
    graph: GraphLayout.Graph;
    hyperedgeIds: Set<string>;
    ref?: SVGRefProp;
}) {
    const nodeMap = () => new Map(props.graph.nodes.map((n) => [n.id, n]));

    // For each hyperedge, collect the unique IDs of incident vertices from
    // the routed edges. (A vertex incident as both input and output appears
    // once.)
    const incidence = () => {
        const map = new Map<string, Set<string>>();
        for (const id of props.hyperedgeIds) {
            map.set(id, new Set());
        }
        for (const edge of props.graph.edges) {
            if (props.hyperedgeIds.has(edge.source)) {
                map.get(edge.source)?.add(edge.target);
            } else if (props.hyperedgeIds.has(edge.target)) {
                map.get(edge.target)?.add(edge.source);
            }
        }
        return map;
    };

    const hullPath = (heId: string): string => {
        const nodes = nodeMap();
        const anchor = nodes.get(heId);
        if (!anchor) {
            return "";
        }
        const incident = incidence().get(heId);
        const pts: GraphLayout.Point[] = [anchor.pos];
        for (const vid of incident ?? []) {
            const v = nodes.get(vid);
            if (v) {
                pts.push(v.pos);
            }
        }
        return pointsToHullPath(pts);
    };

    const visibleNodes = () => props.graph.nodes.filter((n) => !props.hyperedgeIds.has(n.id));

    return (
        <svg ref={props.ref} class="graph" width={props.graph.width} height={props.graph.height}>
            <defs>
                <Index each={["vee"] as const}>
                    {(m) => <Dynamic component={arrowMarkerSVG[m()]} />}
                </Index>
                {/* Like #arrowhead-vee, but `orient="auto"` instead of
                `auto-start-reverse`, so when used as `marker-start` the tip
                points along the path direction (toward the hub) rather than
                away from it. */}
                <marker
                    id="arrowhead-vee-fwd"
                    viewBox="0 0 5 10"
                    refX="5"
                    refY="5"
                    markerWidth="10"
                    markerHeight="10"
                    orient="auto"
                >
                    <path
                        d="M 0 2 L 5 5 L 0 8"
                        style={{ fill: "none", stroke: "var(--color-foreground)" }}
                    />
                </marker>
            </defs>
            <For each={Array.from(props.hyperedgeIds)}>
                {(heId) => <path class={styles.hull} d={hullPath(heId)} />}
            </For>
            <For each={props.graph.edges}>
                {(edge) => {
                    const sourceIsHyperedge = props.hyperedgeIds.has(edge.source);
                    const heId = sourceIsHyperedge ? edge.source : edge.target;
                    const anchor = nodeMap().get(heId);
                    if (!anchor) {
                        return null;
                    }
                    const from = sourceIsHyperedge ? anchor.pos : edge.sourcePos;
                    const to = sourceIsHyperedge ? edge.targetPos : anchor.pos;
                    return (
                        <g class="edge">
                            <path
                                d={curvedArcPath(from, to)}
                                marker-end={sourceIsHyperedge ? "url(#arrowhead-vee)" : undefined}
                                marker-start={
                                    sourceIsHyperedge ? undefined : "url(#arrowhead-vee-fwd)"
                                }
                            />
                        </g>
                    );
                }}
            </For>
            <For each={visibleNodes()}>{(node) => <NodeSVG node={node} />}</For>
        </svg>
    );
}

/** Build the Levi graph and record which node IDs are hyperedges. */
function hypergraphFromModel(model: DblModel): {
    graph: GraphSpec.Graph;
    hyperedgeIds: string[];
} {
    const nodes: GraphSpec.Node[] = [];
    const hyperedgeIds: string[] = [];

    for (const id of model.obGenerators()) {
        const ob = model.obPresentation(id);
        nodes.push({
            id,
            label: ob.label?.join(".") ?? "",
            cssClass: svgStyles["place"],
            minimumWidth: 36,
            minimumHeight: 36,
        });
    }

    const edges: GraphSpec.Edge[] = [];
    for (const id of model.morGenerators()) {
        const mor = model.morPresentation(id);
        if (!mor) {
            continue;
        }
        hyperedgeIds.push(id);
        // Small invisible anchor: gives ELK room to route arcs, but the hull
        // (drawn separately) is what the user sees.
        nodes.push({
            id,
            label: mor.label?.join(".") ?? "",
            minimumWidth: 12,
            minimumHeight: 12,
        });
        for (const [i, ob] of collectProduct(mor.dom).entries()) {
            invariant(ob.tag === "Basic");
            edges.push({
                id: `${id}:dom:${i}`,
                source: ob.content,
                target: id,
            });
        }
        for (const [i, ob] of collectProduct(mor.cod).entries()) {
            invariant(ob.tag === "Basic");
            edges.push({
                id: `${id}:cod:${i}`,
                source: id,
                target: ob.content,
            });
        }
    }

    return { graph: { nodes, edges }, hyperedgeIds };
}

/** A quadratic Bezier arc from `from` to `to`, with the control point offset
perpendicular to the line by a fraction of its length. Gives a gentle bow. */
function curvedArcPath(from: GraphLayout.Point, to: GraphLayout.Point): string {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.hypot(dx, dy);
    if (len < 1) {
        return `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
    }
    const offset = len * 0.15;
    const cx = (from.x + to.x) / 2 - (dy / len) * offset;
    const cy = (from.y + to.y) / 2 + (dx / len) * offset;
    return `M ${from.x} ${from.y} Q ${cx} ${cy} ${to.x} ${to.y}`;
}

/** Convex hull (Andrew's monotone chain) emitted as an SVG path.

A thick round stroke on the path produces the visual padding around the hull
points. Degenerate cases (0, 1, 2 points) render as nothing/a dot/a capsule
purely from stroke geometry.
 */
function pointsToHullPath(points: GraphLayout.Point[]): string {
    const seen = new Set<string>();
    const dedup: GraphLayout.Point[] = [];
    for (const p of points) {
        const key = `${p.x},${p.y}`;
        if (!seen.has(key)) {
            seen.add(key);
            dedup.push(p);
        }
    }
    if (dedup.length === 0) {
        return "";
    }
    if (dedup.length === 1) {
        // Round line cap on a zero-length segment renders as a disk.
        const p = dedup[0];
        invariant(p);
        return `M ${p.x} ${p.y} L ${p.x} ${p.y}`;
    }

    const sorted = dedup.slice().toSorted((a, b) => a.x - b.x || a.y - b.y);
    const cross = (O: GraphLayout.Point, A: GraphLayout.Point, B: GraphLayout.Point) =>
        (A.x - O.x) * (B.y - O.y) - (A.y - O.y) * (B.x - O.x);

    const lower: GraphLayout.Point[] = [];
    for (const p of sorted) {
        while (lower.length >= 2) {
            const a = lower[lower.length - 2];
            const b = lower[lower.length - 1];
            invariant(a && b);
            if (cross(a, b, p) <= 0) {
                lower.pop();
            } else {
                break;
            }
        }
        lower.push(p);
    }
    const upper: GraphLayout.Point[] = [];
    for (let i = sorted.length - 1; i >= 0; i--) {
        const p = sorted[i];
        invariant(p);
        while (upper.length >= 2) {
            const a = upper[upper.length - 2];
            const b = upper[upper.length - 1];
            invariant(a && b);
            if (cross(a, b, p) <= 0) {
                upper.pop();
            } else {
                break;
            }
        }
        upper.push(p);
    }
    lower.pop();
    upper.pop();
    const hull = lower.concat(upper);
    return `M ${hull.map((p) => `${p.x} ${p.y}`).join(" L ")} Z`;
}
