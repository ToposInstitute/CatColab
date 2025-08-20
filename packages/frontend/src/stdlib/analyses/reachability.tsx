import type { DblModel, ReachabilityProblemData } from "catlog-wasm";
import { createMemo } from "solid-js";
import type { ModelAnalysisProps } from "../../analysis";
import { type ColumnSchema, FixedTableEditor, createNumericalColumn } from "../../components";

import type { ObjectDecl } from "../../model";
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
        id = "reachability",
        name = "Reachability model checking",
        description = "Check a Reachability formula",
        help = "reachability",
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
    const obDecls = createMemo<ObjectDecl[]>(() => {
        return props.liveModel.formalJudgments().filter((jgmt) => jgmt.tag === "object");
    }, []);

    const obSchema: ColumnSchema<ObjectDecl>[] = [
        {
            contentType: "string",
            header: true,
            content: (ob) => ob.name,
        },
        createNumericalColumn({
            name: "Initial value",
            data: (ob) => props.content.tokens[ob.id],
            validate: (_, data) => data >= 0,
            setData: (ob, data) =>
                props.changeContent((content) => {
                    content.tokens[ob.id] = data;
                }),
        }),
        createNumericalColumn({
            name: "Forbidden value",
            data: (ob) => props.content.forbidden[ob.id],
            validate: (_, data) => data >= 0,
            setData: (ob, data) =>
                props.changeContent((content) => {
                    content.forbidden[ob.id] = data;
                }),
        }),
    ];

    const reachabilityResult = () => {
        const validated = props.liveModel.validatedModel();

        if (validated?.tag !== "Valid") {
            return "failed";
        } else {
            const res = props.simulate(validated.model, props.content);
            return res
                ? "\u2705: the forbidden tokening is not reachable"
                : "\u274C: the forbidden tokening is reachable";
        }
    };

    return (
        <div class="simulation">
            <p> {"Reachability analysis"} </p>
            <FixedTableEditor rows={obDecls()} schema={obSchema} />
            <p> {reachabilityResult()} </p>
        </div>
    );
}
