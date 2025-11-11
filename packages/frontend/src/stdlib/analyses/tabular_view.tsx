
import type { DiagramAnalysisProps } from "../../analysis";
import type { GraphLayoutConfig } from "../../visualization";
// import { GraphVisualization } from "./graph_visualization";
// import { diagramToGraphviz } from "./diagram_graph";
import { createResource, Switch, Match } from "solid-js";

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

    const [res] = createResource(
        () => {
            const model = props.liveDiagram.liveModel.elaboratedModel();
            const diagram = props.liveDiagram.elaboratedDiagram();
            return model && diagram && [model, diagram];
        },
        async ([model, diagram]) => {
        const response = await axios.post("http://127.0.0.1:8080/acsetcolim", {
                model: model?.presentation(), diagram: diagram?.presentation()
            }, config);
        // console.log(response.data);
        return response.data;
        }
    );
    return (
            <Switch>
                <Match when={res.loading}>
                    <div>⏳ Loading model...</div>
                </Match>
                <Match when={res.error}>
                    <div>❌ Error loading model: {res.error?.message || "Unknown error"}</div>
                </Match>
                <Match when={res()}>
                    {(res) => <div>Tabular Instance: {JSON.stringify(res())}</div>}
                </Match>
            </Switch>
    );
}
