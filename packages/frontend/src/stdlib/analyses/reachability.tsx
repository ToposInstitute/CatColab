import { createSignal } from "solid-js";

import type { DblModel, ReachabilityProblemData } from "catlog-wasm";
import type { ModelAnalysisProps } from "../../analysis";
import { InlineInput } from "../../components";
import type { ModelAnalysisMeta } from "../../theory";

import "./simulation.css";

/** Configuration for a mass-action ODE analysis of a model. */
export type ReachabilityContent = ReachabilityProblemData<string>;

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
    const [text, setText] = createSignal("");
    const [text2, setText2] = createSignal("");

    const validated = props.liveModel.validatedModel();

    const reachabilityResult = () => {
        if (validated?.tag !== "Valid") {
            return "failed";
        } else {
            // Parse input text into vectors
            const objectIds: string[] = validated.model
                .objects()
                .filter((ob) => ob.tag === "Basic")
                .map((ob) => ob.content);

            const initial = Object.fromEntries(
                objectIds.map((x: string) => [
                    x,
                    text()
                        .split(" ")
                        .filter((v: string) => v === props.liveModel.objectIndex().map.get(x) || "")
                        .length,
                ]),
            );

            const forbidden = Object.fromEntries(
                objectIds.map((x: string) => [
                    x,
                    text2()
                        .split(" ")
                        .filter((v: string) => v === props.liveModel.objectIndex().map.get(x) || "")
                        .length,
                ]),
            );
            const data = { tokens: initial, forbidden: forbidden };
            const res = props.simulate(validated.model, data);
            return res
                ? "\u2705: the forbidden tokening is not reachable"
                : "\u274C: the forbidden tokening is reachable";
        }
    };

    return (
        <div class="simulation">
            <InlineInput text={text()} setText={setText} placeholder="Enter initial tokening" />
            <InlineInput text={text2()} setText={setText2} placeholder="Enter forbidden state" />
            <p> {reachabilityResult()} </p>
        </div>
    );
}
