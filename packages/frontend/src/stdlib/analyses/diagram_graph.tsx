import type * as Viz from "@viz-js/viz";

import type { DblModel, DblModelDiagram } from "catlog-wasm";
import type { DiagramAnalysisProps } from "../../analysis";
import type { Theory } from "../../theory";
import type { GraphLayoutConfig, GraphvizAttributes } from "../../visualization";
import * as graphStyles from "../graph_styles";
import { GraphVisualization } from "./graph_visualization";

/** Visualize a diagram in a model as a graph.

Such a visualization makes sense for any discrete double theory and is in
general restricted to basic objects. See `ModelGraph` for more.
 */
export default function DiagramGraph(
    props: DiagramAnalysisProps<GraphLayoutConfig.Config> & {
        title?: string;
    },
) {
    const graph = () => {
        const theory = props.liveDiagram.liveModel.theory();
        const model = props.liveDiagram.liveModel.elaboratedModel();
        const diagram = props.liveDiagram.elaboratedDiagram();
        if (theory && model && diagram) {
            return diagramToGraphviz(diagram, model, theory);
        }
    };

    return (
        <GraphVisualization
            title={props.title}
            graph={graph()}
            config={props.content}
            changeConfig={props.changeContent}
        />
    );
}

/** Convert a diagram in a model into a Graphviz graph. */
export function diagramToGraphviz(
    diagram: DblModelDiagram,
    model: DblModel,
    theory: Theory,
    attributes?: GraphvizAttributes,
): Viz.Graph {
    const nodes = new Map<string, Required<Viz.Graph>["nodes"][0]>();
    for (const id of diagram.obGenerators()) {
        const ob = diagram.obPresentation(id);
        if (!(ob && ob.over.tag === "Basic")) {
            continue;
        }
        const meta = theory.instanceObTypeMeta(ob.obType);
        const label = ob.label?.join(".");
        const overLabel = model.obGeneratorLabel(ob.over.content)?.join(".");
        nodes.set(id, {
            name: id,
            attributes: {
                id,
                label: [label, overLabel].filter((s) => s).join(" : "),
                class: graphStyles.svgNodeCssClasses(meta).join(" "),
                fontname: graphStyles.graphvizFontname(meta),
            },
        });
    }

    const edges: Required<Viz.Graph>["edges"] = [];
    for (const id of diagram.morGenerators()) {
        const mor = diagram.morPresentation(id);
        if (
            !(mor && mor.dom.tag === "Basic" && mor.cod.tag === "Basic" && mor.over.tag === "Basic")
        ) {
            continue;
        }
        const meta = theory.instanceMorTypeMeta(mor.morType);
        const overLabel = model.morGeneratorLabel(mor.over.content)?.join(".");
        edges.push({
            head: mor.cod.content,
            tail: mor.dom.content,
            attributes: {
                id,
                label: overLabel ?? "",
                class: graphStyles.svgEdgeCssClasses(meta).join(" "),
                fontname: graphStyles.graphvizFontname(meta),
            },
        });
    }

    return {
        directed: true,
        nodes: Array.from(nodes.values()),
        edges,
        graphAttributes: { ...graphStyles.defaultGraphAttributes, ...attributes?.graph },
        nodeAttributes: { ...graphStyles.defaultNodeAttributes, ...attributes?.node },
        edgeAttributes: { ...graphStyles.defaultEdgeAttributes, ...attributes?.edge },
    };
}
