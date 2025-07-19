import { A } from "@solidjs/router";
import { For, useContext } from "solid-js";
import invariant from "tiny-invariant";

import { type TheoryLibrary, TheoryLibraryContext } from "../stdlib";
import LogicsContent from "./logics.mdx";

/** Help page for all theories in the standard library. */
export default function LogicsHelpPage() {
    const theories = useContext(TheoryLibraryContext);
    invariant(theories, "Library of theories must be provided as context");

    return <LogicsHelp theories={theories} />;
}

function LogicsHelp(props: {
    theories: TheoryLibrary;
}) {
    return (
        <>
            <LogicsContent />
            <For each={Array.from(props.theories.groupedMetadata().entries())}>
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
