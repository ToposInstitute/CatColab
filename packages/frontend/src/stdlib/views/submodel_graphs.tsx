import type * as Viz from "@viz-js/viz";
import ChevronLeft from "lucide-solid/icons/chevron-left";
import ChevronRight from "lucide-solid/icons/chevron-right";
import { Show, createSignal } from "solid-js";

import type { DblModel } from "catlog-wasm";
import { IconButton } from "../../components";
import type { ModelJudgment } from "../../model";
import type { TheoryMeta } from "../../theory";
import { type GraphvizAttributes, ModelGraphviz } from "./model_graph";

import "./submodel_graphs.css";

/** Visualize submodels of a model of a double theory using Graphviz.
 */
export function SubmodelsGraphviz(props: {
    model: Array<ModelJudgment>;
    submodels: Array<DblModel>;
    theory: TheoryMeta;
    title?: string;
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
        <div class="submodel-graphs">
            <div class="panel">
                <span class="title">{props.title}</span>
                <IconButton onClick={decIndex} disabled={index() <= 0}>
                    <ChevronLeft />
                </IconButton>
                <Show when={props.submodels.length}>
                    {(length) => (
                        <span>
                            {index() + 1} / {length()}
                        </span>
                    )}
                </Show>
                <IconButton onClick={incIndex} disabled={index() >= props.submodels.length - 1}>
                    <ChevronRight />
                </IconButton>
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
