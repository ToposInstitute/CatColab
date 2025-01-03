import { destructure } from "@solid-primitives/destructure";
import { For, Show } from "solid-js";

import { lazyMdx } from "../page/help_page";
import type { Theory } from "./types";

/** Documentation for a theory. */
export function TheoryHelp(props: {
    theory: Theory;
}) {
    const { theory } = destructure(props);

    const Content = lazyMdx(() => import(`../help/theory/${theory().help}.mdx`));

    return (
        <>
            <h1>{theory().name}</h1>
            <h2>Summary</h2>
            <p>{theory().description}</p>
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
            <Show when={theory().help}>
                <Content />
            </Show>
        </>
    );
}
