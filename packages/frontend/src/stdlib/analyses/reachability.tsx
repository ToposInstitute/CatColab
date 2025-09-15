import type { DblModel, ReachabilityProblemData, QualifiedName } from "catlog-wasm";
import { createMemo } from "solid-js";
import type { ModelAnalysisProps } from "../../analysis";
import { type ColumnSchema, FixedTableEditor, createNumericalColumn } from "../../components";

import type { ModelAnalysisMeta } from "../../theory";

import "./simulation.css";

/** Configuration for a mass-action ODE analysis of a model. */
export type ReachabilityContent = ReachabilityProblemData;

type Simulator = (model: DblModel, data: ReachabilityContent) => boolean;

/** Configure a mass-action ODE analysis for use with models of a theory. */
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
        description = "Check a Reachability formula",
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

/** Analyze a model using Reachability formula. */
export function Reachability(
    props: ModelAnalysisProps<ReachabilityContent> & {
        simulate: Simulator;
        title?: string;
    },
) {
    const elaboratedModel = () => props.liveModel.elaboratedModel();
    const obGenerators = createMemo<QualifiedName[]>(() => {
        const model = elaboratedModel();
        if (!model) {
            return [];
        }
        return model
            .obGenerators()
            .filter((id) => model.obType({ tag: "Basic", content: id }));
    }, []);

    const obSchema: ColumnSchema<QualifiedName>[] = [
        {
            contentType: "string",
            header: true,
            content: (id) => elaboratedModel()?.obGeneratorLabel(id)?.join(".") ?? "",
        },
        createNumericalColumn({
            name: "Initial value",
            data: (id) => props.content.tokens[id],
            validate: (_, data) => data >= 0,
            setData: (id, data) =>
                props.changeContent((content) => {
                    content.tokens[id] = data;
                }),
        }),
        createNumericalColumn({
            name: "Forbidden value",
            data: (id) => props.content.forbidden[id],
            validate: (_, data) => data >= 0,
            setData: (id, data) =>
                props.changeContent((content) => {
                    content.forbidden[id] = data;
                }),
        }),
    ];

    const reachabilityMemo = createMemo<string | undefined>(
            () => {
                const validated = props.liveModel.validatedModel();
                if (validated?.tag !== "Valid") {
                    return ;
                } else {
                    const res = props.simulate(validated.model, props.content);
                    return res
                        ? "\u2705: the forbidden tokening is not reachable"
                        : "\u274C: the forbidden tokening is reachable";
                }
            },
            undefined,
            { equals: false },
        );

    return (
        <div class="simulation">
            <p> {"Reachability analysis"} </p>
            <FixedTableEditor rows={obGenerators()} schema={obSchema} />
            <p> {reachabilityMemo()} </p>
        </div>
    );
}
