import ChevronLeft from "lucide-solid/icons/chevron-left";
import ChevronRight from "lucide-solid/icons/chevron-right";
import { createMemo, Show } from "solid-js";

import { BlockTitle, FormGroup, IconButton, InputField } from "catcolab-ui-components";
import type { MotifOccurrence } from "catlog-wasm";
import type { ModelAnalysisProps } from "../../analysis";
import { GraphvizSVG, graphToViz } from "../../visualization";
import type { MotifFinder, MotifFindingAnalysisContent } from "./checker_types";
import { modelToGraph } from "./model_graph";

import "./submodel_graphs.css";

function isNumber(num: number | null | undefined): num is number {
    return (num as number) !== undefined;
}

/** Find submodels of a model and visualize them as graphs. */
export default function SubmodelGraphs(
    props: {
        findSubmodels: MotifFinder;
        title?: string;
    } & ModelAnalysisProps<MotifFindingAnalysisContent>,
) {
    // For compatibility with notebooks created before the `enableMaxPathLength` field was introduced.
    const enableMaxPathLength = () => {
        // If `enableMaxPathLength` has not been set, then set it to be true iff `maxPathLength`
        // already has a (numerical) value.
        if (props.content.enableMaxPathLength === undefined) {
            if (isNumber(props.content.maxPathLength)) {
                props.content.enableMaxPathLength = true;
            } else {
                props.content.enableMaxPathLength = false;
            }
        }
        return props.content.enableMaxPathLength;
    };

    const submodels = createMemo<MotifOccurrence[]>(
        () => {
            const validated = props.liveModel.validatedModel();
            if (validated?.tag !== "Valid") {
                return [];
            }
            return props.findSubmodels(validated.model, {
                maxPathLength:
                    enableMaxPathLength() && isNumber(props.content.maxPathLength)
                        ? props.content.maxPathLength
                        : null,
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
            return modelToGraph(model, theory, submodel.obGenerators, submodel.morGenerators);
        }
    };

    return (
        <div class="submodel-graphs">
            <BlockTitle
                title={props.title}
                actions={indexButtons}
                settingsPane={
                    <FormGroup compact>
                        <InputField
                            type="checkbox"
                            label="Limit length of paths"
                            checked={enableMaxPathLength()}
                            onChange={(evt) =>
                                props.changeContent((content) => {
                                    content.enableMaxPathLength = evt.currentTarget.checked;
                                })
                            }
                        />
                        <Show when={enableMaxPathLength()}>
                            <InputField
                                type="number"
                                min="0"
                                label="Maximum length of path"
                                value={props.content.maxPathLength ?? ""}
                                onChange={(evt) => {
                                    const value = evt.currentTarget.valueAsNumber;
                                    if (value > 0 && Number.isInteger(value)) {
                                        props.changeContent((content) => {
                                            content.maxPathLength = value;
                                        });
                                    }
                                }}
                            />
                        </Show>
                    </FormGroup>
                }
            />
            <Show when={activeGraph()}>
                {(graph) => (
                    <GraphvizSVG
                        graph={graphToViz(graph())}
                        options={{
                            engine: "dot",
                        }}
                    />
                )}
            </Show>
        </div>
    );
}
