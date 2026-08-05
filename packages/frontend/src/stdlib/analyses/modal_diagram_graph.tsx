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
export default function ModalDiagramGraph(
    props: DiagramAnalysisProps<GraphLayoutConfig.Config> & {
        title?: string;
    },
) {
    const graph = () => {
        const theory = props.liveDiagram.liveModel.theory();
        const model = props.liveDiagram.liveModel.elaboratedModel();
        const diagram = props.liveDiagram.elaboratedDiagram();
        if (theory && model && diagram) {
            return modalDiagramToGraph(diagram, model, theory);
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
export function modalDiagramToGraph(
    diagram: DblModelDiagram,
    model: DblModel,
    theory: Theory,
): GraphSpec.Graph {
    // Add nodes for places.
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

    /// Add nodes for transitions and edges for arcs.
    const edges: GraphSpec.Edge[] = [];
    for (const id of diagram.morGenerators()) {
        const mor = diagram.morPresentation(id);
        if (!(mor && mor.over.tag === "Basic")) {
            continue;
        }
        const overLabel = model.morGeneratorLabel(mor.over.content)?.join(".");
        nodes.push({
            id,
            label: overLabel,
            cssClass: "",
            isMonospaced: false,
        });
        /// XXX have cases for each modality
        // incoming edges
        if (mor.dom.tag === "List") {
            for (const ob of mor.dom.content.objects) {
                if (!(ob && ob.tag === "Basic")) {
                    continue;
                }
                edges.push({
                    id: `${id}:dom:${ob.content}`,
                    source: ob.content,
                    target: id,
                    label: "",
                    cssClass: "",
                    isMonospaced: false,
                });
            }
        }
        if (mor.cod.tag === "List") {
            for (const ob of mor.cod.content.objects) {
                if (!(ob && ob.tag === "Basic")) {
                    continue;
                }
                edges.push({
                    id: `${ob.content}:cod:${id}`,
                    source: id,
                    target: ob.content,
                    label: "",
                    cssClass: "",
                    isMonospaced: false,
                });
            }
        } else {
            if (!(mor.cod.tag === "Basic")) {
                continue;
            }
            edges.push({
                id,
                source: id,
                target: mor.cod.content,
                label: "",
                cssClass: "",
                isMonospaced: false,
            });
        }
    }

    return { nodes, edges };
}
