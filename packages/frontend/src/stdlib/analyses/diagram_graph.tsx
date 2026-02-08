import type { DblModel, DblModelDiagram } from "catlog-wasm";
import type { DiagramAnalysisProps } from "../../analysis";
import type { Theory } from "../../theory";
import type { GraphLayoutConfig, GraphSpec } from "../../visualization";
import * as graphStyles from "../graph_styles";
import { GraphVisualizationAnalysis } from "./graph_visualization";

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
            return diagramToGraph(diagram, model, theory);
        }
    };

    return (
        <GraphVisualizationAnalysis
            title={props.title}
            graph={graph()}
            config={props.content}
            changeConfig={props.changeContent}
        />
    );
}

/** Convert a diagram in a model into a graph. */
export function diagramToGraph(
    diagram: DblModelDiagram,
    model: DblModel,
    theory: Theory,
): GraphSpec.Graph {
    const nodes: GraphSpec.Node[] = [];
    for (const id of diagram.obGenerators()) {
        const ob = diagram.obPresentation(id);
        if (!(ob && ob.over.tag === "Basic")) {
            continue;
        }
        const meta = theory.instanceObTypeMeta(ob.obType);
        const label = ob.label?.join(".");
        const overLabel = model.obGeneratorLabel(ob.over.content)?.join(".");
        nodes.push({
            id,
            label: [label, overLabel].filter((s) => s).join(" : "),
            cssClass: graphStyles.svgNodeCssClasses(meta).join(" "),
            isMonospaced: graphStyles.isMonospaced(meta),
        });
    }

    const edges: GraphSpec.Edge[] = [];
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
            id,
            source: mor.dom.content,
            target: mor.cod.content,
            label: overLabel ?? "",
            cssClass: graphStyles.svgEdgeCssClasses(meta).join(" "),
            isMonospaced: graphStyles.isMonospaced(meta),
        });
    }

    return { nodes, edges };
}
