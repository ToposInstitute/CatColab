import { A } from "@solidjs/router";
import { For, useContext } from "solid-js";
import invariant from "tiny-invariant";

import { type TheoryLibrary, TheoryLibraryContext } from "../stdlib";
import TheoriesContent from "./theories.mdx";

/** Help page for all theories in the standard library. */
export default function TheoriesHelpPage() {
    const theories = useContext(TheoryLibraryContext);
    invariant(theories, "Library of theories must be provided as context");

    return <TheoriesHelp theories={theories} />;
}

function TheoriesHelp(props: {
    theories: TheoryLibrary;
}) {
    return (
        <>
            <TheoriesContent />
            <For each={Array.from(props.theories.groupedMetadata().entries())}>
                {([group, theories]) => (
                    <>
                        <h3>{group}</h3>
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
