import { A } from "@solidjs/router";
import { For, useContext } from "solid-js";
import invariant from "tiny-invariant";

import { TheoryLibraryContext } from "../stdlib";
import AnalysesContent from "./analyses.mdx";
import { ModelAnalysisMeta } from "../theory";

/** Help page for all analyses in the standard library. */
export default function AnalysesHelpPage() {
    const theories = useContext(TheoryLibraryContext);
    invariant(theories, "Library of theories must be provided as context");

    // TIM-TO-DO: there must be a nicer way of getting an array of all analyses
    const repeated_analyses = Array.from(theories.metadata()).map((theory, _index) => (
        theories.get(theory.id).modelAnalyses
    )).flat().filter((analysis) => analysis.help)

    return <AnalysesHelp analyses={repeated_analyses} />;
}

function AnalysesHelp(props: {
    analyses: ModelAnalysisMeta<any>[];
}) {
    return (
        <>
            <AnalysesContent />
            <dd>
            <For each={props.analyses}>
                {(analysis) => (
                    <>
                    <dt><A href={`../analyses/${analysis.help}`}>{analysis.name}</A></dt>
                    <dl>{analysis.description}</dl>
                    </>
                )}
            </For>
            </dd>
        </>
    );
}
