import type * as Viz from "@viz-js/viz";
import { Show, createSignal } from "solid-js";

import type { DblModel, DblModelDiagram } from "catlog-wasm";
import type { DiagramAnalysisProps } from "../../analysis";
import { Foldable } from "../../components";
import type { DiagramAnalysisMeta, Theory } from "../../theory";
import {
    DownloadSVGButton,
    GraphLayoutConfig,
    GraphLayoutConfigForm,
    type GraphvizAttributes,
    GraphvizSVG,
} from "../../visualization";
import * as GV from "./graph_visualization";

import "./graph_visualization.css";

/** Configure a graph visualization for use with diagrams in a model. */
export function configureDiagramGraph(options: {
    id: string;
    name: string;
    description?: string;
    help?: string;
}): DiagramAnalysisMeta<GraphLayoutConfig.Config> {
    const { id, name, description, help } = options;
    return {
        id,
        name,
        description,
        help,
        component: (props) => <DiagramGraph title={name} {...props} />,
        initialContent: GraphLayoutConfig.defaultConfig,
    };
}

/** Visualize a diagram in a model as a graph.

Such a visualizations makes sense for any discrete double theory and is in
general restricted to basic objects. See `ModelGraph` for more.
 */
export function DiagramGraph(
    props: {
        title?: string;
    } & DiagramAnalysisProps<GraphLayoutConfig.Config>,
) {
    const [svgRef, setSvgRef] = createSignal<SVGSVGElement>();

    const graphviz = () => {
        const theory = props.liveDiagram.liveModel.theory();
        const model = props.liveDiagram.liveModel.elaboratedModel();
        const validatedDiagram = props.liveDiagram.validatedDiagram();
        return (
            theory &&
            model &&
            validatedDiagram?.tag === "Valid" &&
            diagramToGraphviz(validatedDiagram.diagram, model, theory)
        );
    };

    const title = () => props.title ?? "Diagram";
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
                <Show when={graphviz()}>
                    {(graph) => (
                        <GraphvizSVG
                            graph={graph()}
                            options={GraphLayoutConfig.graphvizOptions(props.content)}
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
    model: DblModel,
    theory: Theory,
    attributes?: GraphvizAttributes,
): Viz.Graph {
    const nodes = new Map<string, Required<Viz.Graph>["nodes"][0]>();
    for (const id of diagram.obGenerators()) {
        const over = diagram.getObOver(id);
        if (over?.tag !== "Basic") {
            continue;
        }
        const obType = diagram.obType({ tag: "Basic", content: id });
        const meta = theory.instanceObTypeMeta(obType);
        const label = diagram.obGeneratorLabel(id)?.join(".");
        const overLabel = model.obGeneratorLabel(over.content)?.join(".");
        nodes.set(id, {
            name: id,
            attributes: {
                id,
                label: [label, overLabel].filter((s) => s).join(" : "),
                class: GV.svgCssClasses(meta).join(" "),
                fontname: GV.graphvizFontname(meta),
            },
        });
    }

    const edges: Required<Viz.Graph>["edges"] = [];
    for (const id of diagram.morGenerators()) {
        const [dom, cod, over] = [diagram.getDom(id), diagram.getCod(id), diagram.getMorOver(id)];
        if (dom?.tag !== "Basic" || cod?.tag !== "Basic" || over?.tag !== "Basic") {
            continue;
        }
        const morType = diagram.morType({ tag: "Basic", content: id });
        const meta = theory.instanceMorTypeMeta(morType);
        const overLabel = model.morGeneratorLabel(over.content)?.join(".");
        edges.push({
            head: cod.content,
            tail: dom.content,
            attributes: {
                id,
                label: overLabel ?? "",
                class: GV.svgCssClasses(meta).join(" "),
                fontname: GV.graphvizFontname(meta),
            },
        });
    }

    return {
        directed: true,
        nodes: Array.from(nodes.values()),
        edges,
        graphAttributes: { ...GV.defaultGraphAttributes, ...attributes?.graph },
        nodeAttributes: { ...GV.defaultNodeAttributes, ...attributes?.node },
        edgeAttributes: { ...GV.defaultEdgeAttributes, ...attributes?.edge },
    };
}
