import { createMemo, Match, Switch } from "solid-js";

import {
    type ColumnSchema,
    createNumericalColumn,
    FixedTableEditor,
    PanelHeader,
} from "catcolab-ui-components";
import {
    type QualifiedName,
    type ReachabilityProblemData,
    ThSymMonoidalCategory,
} from "catlog-wasm";
import type { ModelAnalysisBuilder, ModelAnalysisProps } from "../../analysis";

import "../../stdlib/analyses/simulation.css";

/** Check a reachability property in a Petri net. */
export default {
    contentVersion: 0,
    initialContent: () => ({ tokens: {}, forbidden: {} }),
    component: Reachability,
} satisfies ModelAnalysisBuilder<ReachabilityProblemData>;

const thSymMonoidalCategory = new ThSymMonoidalCategory();

function Reachability(props: ModelAnalysisProps<ReachabilityProblemData>) {
    const elaboratedModel = () => props.liveModel.elaboratedModel();

    const obGenerators = createMemo<QualifiedName[]>(() => elaboratedModel()?.obGenerators() ?? []);

    const obSchema: ColumnSchema<QualifiedName>[] = [
        {
            contentType: "string",
            header: true,
            content: (id) => elaboratedModel()?.obGeneratorLabel(id)?.join(".") ?? "",
        },
        createNumericalColumn({
            name: "Initial tokens",
            data: (id) => props.content.tokens[id],
            validate: (_, data) => data >= 0,
            setData: (id, data) =>
                props.changeContent((content) => {
                    content.tokens[id] = data;
                }),
        }),
        createNumericalColumn({
            name: "Forbidden tokens",
            data: (id) => props.content.forbidden[id],
            validate: (_, data) => data >= 0,
            setData: (id, data) =>
                props.changeContent((content) => {
                    content.forbidden[id] = data;
                }),
        }),
    ];

    const isChecked = createMemo<boolean | undefined>(() => {
        const validated = props.liveModel.validatedModel();
        if (validated?.tag !== "Valid") {
            return;
        }
        return thSymMonoidalCategory.subreachability(validated.model, props.content);
    }, undefined);

    return (
        <div class="simulation">
            <PanelHeader title="Sub-reachability check" />
            <FixedTableEditor rows={obGenerators()} schema={obSchema} />
            <Switch>
                <Match when={isChecked() === true}>
                    <p>{"\u2705 forbidden tokening is not reachable"}</p>
                </Match>
                <Match when={isChecked() === false}>
                    <p>{"\u274C forbidden tokening is reachable"}</p>
                </Match>
            </Switch>
        </div>
    );
}
