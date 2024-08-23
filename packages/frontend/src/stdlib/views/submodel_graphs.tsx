import type * as Viz from "@viz-js/viz";
import { createSignal } from "solid-js";

import type { DblModel } from "catlog-wasm";
import type { ModelJudgment } from "../../model";
import type { TheoryMeta } from "../../theory";
import { type GraphvizAttributes, ModelGraphviz } from "./model_graph";

/** Visualize submodels of a model of a double theory using Graphviz.
 */
export function SubmodelsGraphviz(props: {
    model: Array<ModelJudgment>;
    submodels: Array<DblModel>;
    theory: TheoryMeta;
    attributes?: GraphvizAttributes;
    options?: Viz.RenderOptions;
}) {
    const [index, setIndex] = createSignal(0);

    const decIndex = () => setIndex(Math.max(0, index() - 1));
    const incIndex = () => setIndex(Math.min(index() + 1, props.submodels.length - 1));

    const filteredModel = () => {
        if (index() >= props.submodels.length) {
            return [];
        }
        const submodel = props.submodels[index()];
        return props.model.filter((judgment) => {
            if (judgment.tag === "object") {
                return submodel.hasOb({ tag: "Basic", content: judgment.id });
            } else if (judgment.tag === "morphism") {
                return submodel.hasMor({ tag: "Basic", content: judgment.id });
            } else {
                return false;
            }
        });
    };

    return (
        <div class="submodels">
            <div class="panel">
                <button onClick={decIndex} disabled={index() <= 0}>
                    Previous
                </button>
                <button onClick={incIndex} disabled={index() >= props.submodels.length - 1}>
                    Next
                </button>
            </div>
            <ModelGraphviz
                model={filteredModel()}
                theory={props.theory}
                attributes={props.attributes}
                options={props.options}
            />
        </div>
    );
}
