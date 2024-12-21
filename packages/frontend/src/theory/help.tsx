import { destructure } from "@solid-primitives/destructure";
import { Show } from "solid-js";

import { lazyMdx } from "../page/help_page";
import type { Theory } from "./types";

/** Documentation for a theory. */
export function TheoryHelp(props: {
    theory: Theory;
}) {
    const { theory } = destructure(props);

    const Content = lazyMdx(() => import(`../help/theory/${theory().help}.mdx`));

    return (
        <div class="theory-help">
            <h1>{theory().name}</h1>
            <Show when={theory().help}>
                <Content />
            </Show>
        </div>
    );
}
