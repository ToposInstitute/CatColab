import { A } from "@solidjs/router";
import { For, useContext } from "solid-js";
import invariant from "tiny-invariant";

import { TheoryLibraryContext } from "../stdlib";
import LogicsHelpOverviewContent from "./logics_help_overview.mdx";

/** Help page for all theories in the standard library. */
export default function LogicsHelpOverview() {
    const theories = useContext(TheoryLibraryContext);
    invariant(theories, "Library of theories must be provided as context");

    return (
        <>
            <LogicsHelpOverviewContent />
            <For each={Array.from(theories.groupedMetadata().entries())}>
                {([group, theories]) => (
                    <>
                        <h2>{group}</h2>
                        <dl>
                            <For each={theories}>
                                {(theoryMeta) => (
                                    <>
                                        <dt>
                                            <A href={`../logics/${theoryMeta.id}`}>
                                                {theoryMeta.name}
                                            </A>
                                        </dt>
                                        <dd>{theoryMeta.description}</dd>
                                    </>
                                )}
                            </For>
                        </dl>
                    </>
                )}
            </For>
        </>
    );
}
