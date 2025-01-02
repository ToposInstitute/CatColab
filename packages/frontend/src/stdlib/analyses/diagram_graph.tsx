import type * as Viz from "@viz-js/viz";
import { Show, createSignal } from "solid-js";
import { P, match } from "ts-pattern";

import type { DblModelDiagram, Uuid } from "catlog-wasm";
import type { DiagramAnalysisProps } from "../../analysis";
import { PanelHeader } from "../../components";
import type { DiagramAnalysisMeta, Theory } from "../../theory";
import type { Name } from "../../util/indexing";
import { DownloadSVGButton, GraphvizSVG } from "../../visualization";
import {
    type GraphContent,
    type GraphvizAttributes,
    defaultEdgeAttributes,
    defaultGraphAttributes,
    defaultNodeAttributes,
    graphvizEngine,
    graphvizFontname,
    svgCssClasses,
} from "./graph_visualization";

import "./graph_visualization.css";

/** Configure a graph visualization for use with diagrams in a model. */
export function configureDiagramGraph(options: {
    id: string;
    name: string;
    description?: string;
}): DiagramAnalysisMeta<GraphContent> {
    const { id, name, description } = options;
    return {
        id,
        name,
        description,
        component: (props) => <DiagramGraph title={name} {...props} />,
        initialContent: () => ({
            tag: "graph",
            layout: "graphviz-directed",
        }),
    };
}

/** Visualize a diagram in a model as a graph.

Such a visualizations makes sense for any discrete double theory and is in
general restricted to basic objects. See `ModelGraph` for more.
 */
export function DiagramGraph(
    props: {
        title?: string;
    } & DiagramAnalysisProps<GraphContent>,
) {
    const [svgRef, setSvgRef] = createSignal<SVGSVGElement>();

    const graphviz = () => {
        const liveModel = props.liveDiagram.liveModel;
        const theory = liveModel.theory();
        const validatedDiagram = props.liveDiagram.validatedDiagram();
        return (
            theory &&
            validatedDiagram?.result.tag === "Ok" &&
            diagramToGraphviz(validatedDiagram.diagram, theory, {
                obName(id) {
                    return props.liveDiagram.objectIndex().map.get(id);
                },
                baseObName(id) {
                    return liveModel.objectIndex().map.get(id);
                },
                baseMorName(id) {
                    return liveModel.morphismIndex().map.get(id);
                },
            })
        );
    };

    const title = () => props.title ?? "Diagram";

    return (
        <div class="graph-visualization-analysis">
            <PanelHeader title={title()}>
                <DownloadSVGButton
                    svg={svgRef()}
                    tooltip={`Export the ${title().toLowerCase()} as SVG`}
                    size={16}
                />
            </PanelHeader>
            <div class="graph-visualization">
                <Show when={graphviz()}>
                    {(graph) => (
                        <GraphvizSVG
                            graph={graph()}
                            options={{
                                engine: graphvizEngine(props.content.layout),
                            }}
                            ref={setSvgRef}
                        />
                    )}
                </Show>
            </div>
        </div>
    );
}

/** Convert a diagram in a model into a Graphviz graph.
 */
export function diagramToGraphviz(
    diagram: DblModelDiagram,
    theory: Theory,
    options?: {
        obName?: (id: Uuid) => Name | undefined;
        baseObName?: (id: Uuid) => string | undefined;
        baseMorName: (id: Uuid) => string | undefined;
        attributes?: GraphvizAttributes;
    },
): Viz.Graph {
    const nodes = new Map<string, Required<Viz.Graph>["nodes"][0]>();
    for (const judgment of diagram.objectDeclarations()) {
        const matched = match(judgment)
            .with(
                {
                    id: P.select("id"),
                    obType: P.select("obType"),
                    over: {
                        tag: "Basic",
                        content: P.select("overId"),
                    },
                },
                (matched) => matched,
            )
            .otherwise(() => null);
        if (!matched) {
            continue;
        }
        const { id, obType, overId } = matched;
        const name = options?.obName?.(id);
        const overName = options?.baseObName?.(overId);
        const meta = theory.instanceObTypeMeta(obType);
        nodes.set(id, {
            name: id,
            attributes: {
                id,
                label: [name, overName].filter((s) => s).join(" : "),
                class: svgCssClasses(meta).join(" "),
                fontname: graphvizFontname(meta),
            },
        });
    }

    const edges: Required<Viz.Graph>["edges"] = [];
    for (const judgment of diagram.morphismDeclarations()) {
        const matched = match(judgment)
            .with(
                {
                    id: P.select("id"),
                    morType: P.select("morType"),
                    over: {
                        tag: "Basic",
                        content: P.select("overId"),
                    },
                    dom: {
                        tag: "Basic",
                        content: P.select("domId"),
                    },
                    cod: {
                        tag: "Basic",
                        content: P.select("codId"),
                    },
                },
                (matched) => matched,
            )
            .otherwise(() => null);
        if (!matched) {
            continue;
        }
        const { id, morType, overId, codId, domId } = matched;
        const meta = theory.instanceMorTypeMeta(morType);
        edges.push({
            head: codId,
            tail: domId,
            attributes: {
                id,
                label: options?.baseMorName?.(overId) ?? "",
                class: svgCssClasses(meta).join(" "),
                fontname: graphvizFontname(meta),
            },
        });
    }

    const attributes = options?.attributes;
    return {
        directed: true,
        nodes: Array.from(nodes.values()),
        edges,
        graphAttributes: { ...defaultGraphAttributes, ...attributes?.graph },
        nodeAttributes: { ...defaultNodeAttributes, ...attributes?.node },
        edgeAttributes: { ...defaultEdgeAttributes, ...attributes?.edge },
    };
}
