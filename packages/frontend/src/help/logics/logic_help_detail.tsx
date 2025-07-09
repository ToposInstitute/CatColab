import { useParams } from "@solidjs/router";
import { For, type JSXElement, Show, lazy, useContext } from "solid-js";
import { Dynamic } from "solid-js/web";
import invariant from "tiny-invariant";

import { TheoryLibraryContext } from "../../stdlib";
import type { Theory } from "../../theory";
import LogicNotFound from "./logic-not-found.mdx";

/** Help page for a theory in the standard library. */
export default function LogicHelpDetail() {
    const theories = useContext(TheoryLibraryContext);
    invariant(theories, "Library of theories must be provided as context");

    const params = useParams();

    const theory = () => {
        invariant(params.id, "Theory ID must be provided as parameter");
        return theories.get(params.id);
    };

    const Content = lazy(async () => {
        try {
            return await import(`./${params.id}.mdx`);
        } catch {
            return { default: LogicNotFound };
        }
    });

    return (
        <>
            <h1>
                <a href="/help/logics/">Logics</a> / {theory().name}
            </h1>
            <h2>Summary</h2>
            <p>{theory().description}</p>
            <Show when={theory().modelTypes.length > 0}>
                <h3>Definitions</h3>
                <dl>
                    <For each={theory().modelTypes}>
                        {(typeMeta) => (
                            <>
                                <dt>{typeMeta.name}</dt>
                                <dd>{typeMeta.description}</dd>
                            </>
                        )}
                    </For>
                </dl>
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
                    ? lazy(() => import(`../analysis/${analysis().help}.mdx`))
                    : null;

                return (
                    <div class="help-analysis-pane">
                        <h3>{analysis.name}</h3>
                        <p>
                            <i>{analysis().description}</i>
                        </p>
                        {props.children}
                        {HelpComponent && <Dynamic component={HelpComponent} />}
                    </div>
                );
            }}
        </Show>
    );
}
