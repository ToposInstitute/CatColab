import { createMemo, Match, Switch } from "solid-js";

import {
    type ColumnSchema,
    createNumericalColumn,
    FixedTableEditor,
    PanelHeader,
} from "catcolab-ui-components";
import type { QualifiedName, ReachabilityProblemData } from "catlog-wasm";
import type { ModelAnalysisProps } from "../../analysis";
import type { ReachabilityChecker } from "./checker_types";

import "./simulation.css";

/** Check a reachability property in a model. */
export default function Reachability(
    props: ModelAnalysisProps<ReachabilityProblemData> & {
        check: ReachabilityChecker;
        title?: string;
    },
) {
    const elaboratedModel = () => props.liveModel.elaboratedModel();

    const obGenerators = createMemo<QualifiedName[]>(
        () => elaboratedModel()?.obGenerators() ?? [],
        [],
    );

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
        return props.check(validated.model, props.content);
    }, undefined);

    return (
        <div class="simulation">
            <PanelHeader title={props.title} />
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
