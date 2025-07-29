import { useParams } from "@solidjs/router";
import { For, type JSXElement, Show, createResource, lazy, useContext } from "solid-js";
import { Dynamic } from "solid-js/web";
import invariant from "tiny-invariant";

import { TheoryLibraryContext } from "../stdlib";
import type { Theory } from "../theory";
import LogicHelpNotFound from "./logics/logic-help-not-found.mdx";

/** Help page for a theory in the standard library. */
export default function LogicHelpDetail() {
    const theories = useContext(TheoryLibraryContext);
    invariant(theories, "Library of theories must be provided as context");

    const params = useParams();

    const [theory] = createResource(
        () => params.id,
        (theoryId) => theories.get(theoryId),
    );
    const modelTypes = () => theory()?.modelTypes ?? [];
    const modelAnalyses = () => theory()?.modelAnalyses ?? [];

    const Content = lazy(async () => {
        try {
            return await import(`./logics/${params.id}.mdx`);
        } catch {
            return { default: LogicHelpNotFound };
        }
    });

    return (
        <>
            <h1>
                <a href="/help/logics/">Logics</a> / {theory()?.name}
            </h1>
            <h2>Summary</h2>
            <p>
                <i>{theory()?.description}</i>
            </p>
            <Show when={modelTypes().length + modelAnalyses().length > 0}>
                <div class="help-summary-lists">
                    <Show when={modelTypes().length > 0}>
                        <div>
                            <h3>Definitions</h3>
                            <dl>
                                <For each={modelTypes()}>
                                    {(typeMeta) => (
                                        <>
                                            <dt>{typeMeta.name}</dt>
                                            <dd>{typeMeta.description}</dd>
                                        </>
                                    )}
                                </For>
                            </dl>
                        </div>
                    </Show>
                    <Show when={modelAnalyses().length > 0}>
                        <div>
                            <h3>Analyses</h3>
                            <dl>
                                <For each={modelAnalyses()}>
                                    {(typeMeta) => (
                                        <>
                                            <dt>{typeMeta.name}</dt>
                                            <dd>{typeMeta.description}</dd>
                                        </>
                                    )}
                                </For>
                            </dl>
                        </div>
                    </Show>
                </div>
            </Show>
            <Content theory={theory()} />
        </>
    );
}

export type HelpAnalysisProps = {
    theory: Theory;
    analysisId: string;
    children?: JSXElement;
};

/** Documentation for an analysis of a theory. */
export function HelpAnalysisById(props: HelpAnalysisProps) {
    const analysis = () => props.theory.modelAnalyses.find((a) => a.id === props.analysisId);

    return (
        <Show when={analysis()}>
            {(analysis) => {
                const HelpComponent = analysis
                    ? lazy(() => import(`./analysis/${analysis().help}.mdx`))
                    : null;

                return (
                    <div class="help-analysis-pane">
                        <h3>{analysis().name}</h3>
                        <p class="help-analysis-pane-description">{analysis().description}</p>
                        {props.children}
                        {HelpComponent && <Dynamic component={HelpComponent} />}
                    </div>
                );
            }}
        </Show>
    );
}
