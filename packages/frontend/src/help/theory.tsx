import { destructure } from "@solid-primitives/destructure";
import { useParams } from "@solidjs/router";
import { For, Show, useContext } from "solid-js";
import invariant from "tiny-invariant";

import { TheoryLibraryContext } from "../stdlib";
import type { Theory } from "../theory";
import { lazyMdx } from "../util/mdx";

/** Help page for a theory in the standard library. */
export default function TheoryHelpPage() {
    const theories = useContext(TheoryLibraryContext);
    invariant(theories, "Library of theories must be provided as context");

    const params = useParams();

    const theory = () => {
        invariant(params.id, "Theory ID must be provided as parameter");
        return theories.get(params.id);
    };

    return <TheoryHelp theory={theory()} />;
}

/** Documentation for a theory. */
export function TheoryHelp(props: {
    theory: Theory;
}) {
    const { theory } = destructure(props);

    const Content = lazyMdx(() => import(`./theory/${theory().help}.mdx`));

    return (
        <>
            <h1>{theory().name}</h1>
            <h2>Summary</h2>
            <p>{theory().description}</p>
            <Show when={theory().modelTypes.length > 0}>
                <h4>Definitions</h4>
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
                <Content />
            </Show>
        </>
    );
}
