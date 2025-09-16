import { Match, Switch, createMemo } from "solid-js";

import type { DblModel, QualifiedName, ReachabilityProblemData } from "catlog-wasm";
import type { ModelAnalysisProps } from "../../analysis";
import {
    type ColumnSchema,
    FixedTableEditor,
    PanelHeader,
    createNumericalColumn,
} from "../../components";
import type { ModelAnalysisMeta } from "../../theory";

import "./simulation.css";

/** Configuration for a reachability analysis of a model. */
export type ReachabilityContent = ReachabilityProblemData;

type Checker = (model: DblModel, data: ReachabilityContent) => boolean;

/** Configure a reachability analysis for use with models of a theory. */
export function configureReachability(options: {
    id?: string;
    name?: string;
    description?: string;
    help?: string;
    check: Checker;
}): ModelAnalysisMeta<ReachabilityContent> {
    const {
        id = "subreachability",
        name = "Sub-reachability check",
        description = "Check that forbidden tokenings are unreachable",
        help = "subreachability",
        ...otherOptions
    } = options;
    return {
        id,
        name,
        description,
        help,
        component: (props) => <Reachability title={name} {...otherOptions} {...props} />,
        initialContent: () => ({ tokens: {}, forbidden: {} }),
    };
}

/** Check a reachability property in a model. */
export function Reachability(
    props: ModelAnalysisProps<ReachabilityContent> & {
        check: Checker;
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
