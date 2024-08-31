import type * as Viz from "@viz-js/viz";
import ChevronLeft from "lucide-solid/icons/chevron-left";
import ChevronRight from "lucide-solid/icons/chevron-right";
import { Show } from "solid-js";

import type { DblModel } from "catlog-wasm";
import { IconButton } from "../components";
import type { ModelJudgment } from "../model";
import type { ModelAnalysisMeta, Theory } from "../theory";
import { type GraphvizAttributes, ModelGraphviz } from "./model_graph";
import type { ModelAnalysisProps, SubmodelsAnalysisContent } from "./types";

import "./submodel_graphs.css";

/** Configure a submodel analysis for use with a double theory. */
export function configureSubmodelsAnalysis(options: {
    id: string;
    name: string;
    description?: string;
    findSubmodels: (model: DblModel) => Array<DblModel>;
}): ModelAnalysisMeta<SubmodelsAnalysisContent> {
    const { id, name, description, findSubmodels } = options;
    return {
        id,
        name,
        description,
        component: (props) => (
            <SubmodelsAnalysis title={name} findSubmodels={findSubmodels} {...props} />
        ),
        initialContent: () => ({
            tag: "submodels",
            activeIndex: 0,
        }),
    };
}

function SubmodelsAnalysis(
    props: {
        findSubmodels: (model: DblModel) => Array<DblModel>;
        title?: string;
    } & ModelAnalysisProps<SubmodelsAnalysisContent>,
) {
    return (
        <SubmodelsGraphviz
            model={props.model}
            submodels={props.validatedModel ? props.findSubmodels(props.validatedModel) : []}
            theory={props.theory}
            activeIndex={props.content.activeIndex}
            setActiveIndex={(index: number) =>
                props.changeContent((content) => {
                    content.activeIndex = index;
                })
            }
            title={props.title}
            // Should we expose layout options?
            options={{
                engine: "dot",
            }}
            attributes={{
                graph: {
                    // For compactness.
                    rankdir: "LR",
                },
            }}
        />
    );
}

/** Display submodels of a model of a double theory using Graphviz.

The index of the active (currently displayed) submodel is managed externally to
the component.
 */
export function SubmodelsGraphviz(props: {
    model: Array<ModelJudgment>;
    submodels: Array<DblModel>;
    theory: Theory;
    activeIndex: number;
    setActiveIndex: (index: number) => void;
    title?: string;
    attributes?: GraphvizAttributes;
    options?: Viz.RenderOptions;
}) {
    const index = () => props.activeIndex;
    const setIndex = (index: number) => props.setActiveIndex(index);
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
