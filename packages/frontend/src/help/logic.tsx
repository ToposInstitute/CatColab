import { destructure } from "@solid-primitives/destructure";
import { useParams } from "@solidjs/router";
import { For, type JSXElement, Show, lazy, useContext } from "solid-js";
import { Dynamic } from "solid-js/web";
import invariant from "tiny-invariant";

import { TheoryLibraryContext } from "../stdlib";
import type { Theory } from "../theory";

/** Help page for a theory in the standard library. */
export default function LogicHelpPage() {
    const theories = useContext(TheoryLibraryContext);
    invariant(theories, "Library of theories must be provided as context");

    const params = useParams();

    const theory = () => {
        invariant(params.id, "Theory ID must be provided as parameter");
        return theories.get(params.id);
    };

    return <LogicHelp theory={theory()} />;
}

/** Documentation for a theory. */
export function LogicHelp(props: {
    theory: Theory;
}) {
    const { theory } = destructure(props);
    const helpLogicContent = (name: string) => lazy(() => import(`./logic/${name}.mdx`));

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
            <Show when={theory().help}>
                {(name) => <Dynamic component={helpLogicContent(name())} theory={theory()} />}
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
function helpAnalysisByIdContent(props: HelpAnalysisProps) {
    let content = <></>;
    const analysis = props.theory.modelAnalyses.filter(
        (analysis) => analysis.id === props.analysisId,
    )[0];
    if (analysis !== undefined) {
        let helpMdxContent = <></>;
        if (analysis.help) {
            const mdx_component = lazy(() => import(`./analysis/${analysis.help}.mdx`));
            helpMdxContent = <Dynamic component={mdx_component} />;
        }
        content = (
            <div class="help-analysis-pane">
                <h3>{analysis.name}</h3>
                <p>
                    <i>{analysis.description}</i>
                </p>
                {props.children}
                {helpMdxContent}
            </div>
        );
    }
    return content;
}

export const HelpAnalysisById = (props: HelpAnalysisProps) =>
    helpAnalysisByIdContent({
        theory: props.theory,
        analysisId: props.analysisId,
        children: props.children,
    });
