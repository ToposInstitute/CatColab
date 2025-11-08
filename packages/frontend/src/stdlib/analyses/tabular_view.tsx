
import type { DiagramAnalysisProps } from "../../analysis";
import type { GraphLayoutConfig } from "../../visualization";
import { GraphVisualization } from "./graph_visualization";
import { diagramToGraphviz } from "./diagram_graph";
import axios from 'axios';

const config = {
    url:"http://127.0.0.1:8080",
    method: "post",
    headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, PUT, DELETE, GET, OPTIONS',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Allow-Credentials': 'false'
    }
};


/** Visualize a diagram in a model as a graph.

Such a visualization makes sense for any discrete double theory and is in
general restricted to basic objects. See `ModelGraph` for more.
 */
export default function TabularView(
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

    // const call = async (data: string) => {return await ;}

    const res = () => {
        const model = props.liveDiagram.liveModel.elaboratedModel();
        const diagram = props.liveDiagram.elaboratedDiagram();
        const data = axios.post("http://127.0.0.1:8080/acsetcolim", {
            model:model?.presentation(), diagram:diagram?.presentation()
        }, config);
        return data.then(res => { 
    console.log(res); // getting a value
    return res});
   }

    return (
        <GraphVisualization
            title={"TABULAR VIEW: "+res()}
            graph={graph()}
            config={props.content}
            changeConfig={props.changeContent}
        />
    );
}
