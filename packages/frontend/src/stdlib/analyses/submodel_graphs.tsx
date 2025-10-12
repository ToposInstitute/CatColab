import ChevronLeft from "lucide-solid/icons/chevron-left";
import ChevronRight from "lucide-solid/icons/chevron-right";
import { Show, createMemo } from "solid-js";

import type { DblModel, MotifOccurrence, MotifsOptions } from "catlog-wasm";
import type { ModelAnalysisProps } from "../../analysis";
import { Foldable, FormGroup, IconButton, InputField } from "../../components";
import type { ModelAnalysisMeta } from "../../theory";
import { GraphvizSVG } from "../../visualization";
import { modelToGraphviz } from "./model_graph";

import "./submodel_graphs.css";

type FindSubmodelsFn = (model: DblModel, options: MotifsOptions) => MotifOccurrence[];

/** Configuration and state of a submodels analysis. */
export type SubmodelsAnalysisContent = {
    /** Index of active submodel. */
    activeIndex: number;

    /** Maximum length of paths used in morphism search. */
    maxPathLength?: number | null;
};

/** Configure a submodel analysis for use with a double theory. */
export function configureSubmodelsAnalysis(options: {
    id: string;
    name: string;
    description?: string;
    help?: string;
    findSubmodels: FindSubmodelsFn;
}): ModelAnalysisMeta<SubmodelsAnalysisContent> {
    const { id, name, description, help, findSubmodels } = options;
    return {
        id,
        name,
        description,
        help,
        component: (props) => (
            <SubmodelsAnalysis title={name} findSubmodels={findSubmodels} {...props} />
        ),
        initialContent: () => ({
            activeIndex: 0,
            maxPathLength: 5,
        }),
    };
}

function SubmodelsAnalysis(
    props: {
        findSubmodels: FindSubmodelsFn;
        title?: string;
    } & ModelAnalysisProps<SubmodelsAnalysisContent>,
) {
    const submodels = createMemo<MotifOccurrence[]>(
        () => {
            const validated = props.liveModel.validatedModel();
            if (validated?.tag !== "Valid") {
                return [];
            }
            return props.findSubmodels(validated.model, {
                maxPathLength: props.content.maxPathLength ?? null,
            });
        },
        [],
        { equals: false },
    );

    const index = () => props.content.activeIndex;
    const setIndex = (index: number) =>
        props.changeContent((content) => {
            content.activeIndex = index;
        });
    const decIndex = () => setIndex(Math.max(0, index() - 1));
    const incIndex = () => setIndex(Math.min(index() + 1, submodels().length - 1));

    const indexButtons = (
        <div class="index-buttons">
            <IconButton onClick={decIndex} disabled={index() <= 0}>
                <ChevronLeft />
            </IconButton>
            <Show when={submodels().length}>
                {(length) => (
                    <span>
                        {index() + 1} / {length()}
                    </span>
                )}
            </Show>
            <IconButton onClick={incIndex} disabled={index() >= submodels().length - 1}>
                <ChevronRight />
            </IconButton>
        </div>
    );

    const activeGraph = () => {
        const theory = props.liveModel.theory();
        const model = props.liveModel.elaboratedModel();
        const submodel = submodels()[index()];
        if (theory && model && submodel) {
            return modelToGraphviz(
                model,
                theory,
                undefined,
                submodel.obGenerators,
                submodel.morGenerators,
            );
        }
    };

    return (
        <div class="submodel-graphs">
            <Foldable title={props.title} header={indexButtons}>
                <FormGroup compact>
                    <InputField
                        type="checkbox"
                        label="Limit length of paths"
                        checked={props.content.maxPathLength != null}
                        onChange={(evt) =>
                            props.changeContent((content) => {
                                content.maxPathLength = evt.currentTarget.checked ? 1 : null;
                            })
                        }
                    />
                    <Show when={props.content.maxPathLength != null}>
                        <InputField
                            type="number"
                            min="0"
                            label="Maximum length of path"
                            value={props.content.maxPathLength ?? ""}
                            onChange={(evt) =>
                                props.changeContent((content) => {
                                    content.maxPathLength = evt.currentTarget.valueAsNumber;
                                })
                            }
                        />
                    </Show>
                </FormGroup>
            </Foldable>
            <Show when={activeGraph()}>
                {(graph) => (
                    <GraphvizSVG
                        graph={graph()}
                        options={{
                            engine: "dot",
                        }}
                    />
                )}
            </Show>
        </div>
    );
}
