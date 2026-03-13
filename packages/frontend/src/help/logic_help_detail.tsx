import { Title } from "@solidjs/meta";
import { useParams } from "@solidjs/router";
import { createResource, For, type JSXElement, lazy, Show, useContext } from "solid-js";
import { Dynamic } from "solid-js/web";
import invariant from "tiny-invariant";

import { compositionPattern } from "../stdlib/analyses";
import { type ModelAnalysisMeta, type Theory, TheoryLibraryContext } from "../theory";

/** Help page for a theory in the standard library. */
export default function LogicHelpPage() {
    const theories = useContext(TheoryLibraryContext);
    invariant(theories, "Library of theories must be provided as context");

    const params = useParams();

    const [theory] = createResource(
        () => params.id,
        (theoryId) => theories.get(theoryId),
    );

    const appTitle = import.meta.env.VITE_APP_TITLE;

    return (
        <Show when={theory()}>
            {(theory) => (
                <>
                    <Title>
                        {theory().name} - {appTitle}
                    </Title>
                    <LogicHelpDetail theory={theory()} />
                </>
            )}
        </Show>
    );
}

/** Get all model analyses for a theory, including auto-injected ones. */
function modelAnalyses(theory: Theory): ModelAnalysisMeta[] {
    const analyses = [...theory.modelAnalyses];
    if (theory.theory.canInstantiateModels() && !theory.modelAnalysis("composition-pattern")) {
        analyses.push(compositionPattern());
    }
    return analyses;
}

function LogicHelpDetail(props: { theory: Theory }) {
    const [content] = createResource(
        () => props.theory.id,
        async (theoryId) => {
            try {
                return await import(`./logics/${theoryId}.mdx`);
            } catch {
                const fallback = await import("./logics/logic-help-not-found.mdx");
                return fallback;
            }
        },
    );

    return (
        <>
            <h1>
                <a href="/help/logics/">Logics</a> / {props.theory.name}
            </h1>
            <h2>Summary</h2>
            <p>
                <i>{props.theory.description}</i>
            </p>
            {(() => {
                const analyses = modelAnalyses(props.theory);
                return (
                    <Show when={props.theory.modelTypes.length + analyses.length > 0}>
                        <div class="help-summary-lists">
                            <Show when={props.theory.modelTypes.length > 0}>
                                <div>
                                    <h3>Definitions</h3>
                                    <dl>
                                        <For each={props.theory.modelTypes}>
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
                            <Show when={analyses.length > 0}>
                                <div>
                                    <h3>Analyses</h3>
                                    <dl>
                                        <For each={analyses}>
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
                );
            })()}
            <Show when={content()}>
                {(module) => <Dynamic component={module().default} theory={props.theory} />}
            </Show>
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
    const analysis = () =>
        props.theory.modelAnalysis(props.analysisId) ??
        (props.analysisId === "composition-pattern" && props.theory.theory.canInstantiateModels()
            ? compositionPattern()
            : undefined);

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
