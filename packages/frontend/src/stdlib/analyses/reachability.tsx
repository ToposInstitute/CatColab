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

type Simulator = (model: DblModel, data: ReachabilityContent) => boolean;

/** Configure a reachability analysis for use with models of a theory. */
export function configureReachability(options: {
    id?: string;
    name?: string;
    description?: string;
    help?: string;
    simulate: Simulator;
}): ModelAnalysisMeta<ReachabilityContent> {
    const {
        id = "subreachability",
        name = "Sub-reachability model checking",
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
        simulate: Simulator;
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

    const isForbiddenUnreachable = createMemo<boolean | undefined>(() => {
        const validated = props.liveModel.validatedModel();
        if (validated?.tag !== "Valid") {
            return;
        } else {
            return props.simulate(validated.model, props.content);
        }
    }, undefined);

    return (
        <div class="simulation">
            <PanelHeader title="Subreachability analysis" />
            <FixedTableEditor rows={obGenerators()} schema={obSchema} />
            <Switch>
                <Match when={isForbiddenUnreachable() === false}>
                    <p>{"\u274C forbidden tokening is reachable"}</p>
                </Match>
                <Match when={isForbiddenUnreachable() === true}>
                    <p>{"\u2705 forbidden tokening is not reachable"}</p>
                </Match>
            </Switch>
        </div>
    );
}
