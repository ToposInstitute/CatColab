import { destructure } from "@solid-primitives/destructure";
import { useParams } from "@solidjs/router";
import { For, Show, lazy, useContext } from "solid-js";
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

export function helpLogicAnalyses(props: {
    theory: Theory;
}) {
    const { theory } = destructure(props);

    return (
        <>
            <Show when={theory().modelAnalyses.length > 0}>
                <dl>
                    <For each={theory().modelAnalyses}>
                        {(analysisMeta) => (
                            <>
                                <dt>
                                    <Show when={analysisMeta.help} fallback={analysisMeta.name}>
                                        <a href={`/help/analysis/${analysisMeta.help}`}>
                                            {analysisMeta.name}
                                        </a>
                                    </Show>
                                </dt>
                                <dd>{analysisMeta.description}</dd>
                            </>
                        )}
                    </For>
                </dl>
            </Show>
        </>
    );
}

const helpLogicContent = (name: string) => lazy(() => import(`./logic/${name}.mdx`));
