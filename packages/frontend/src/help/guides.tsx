import { A } from "@solidjs/router";
import { For } from "solid-js";
import GuidesContent from "./guides.mdx";

export type Guide = {
    id: string;
    title: string;
    description: string;
};

export const guidesList: Guide[] = [
    {
        id: "predator-prey",
        title: "Predator–prey (causal loop diagrams)",
        description:
            "Understanding a simple foxes–rabbits–lettuce ecosystem through Lotka–Volterra dynamics",
    },
    {
        id: "seirv",
        title: "SEIRV (stock-flow diagrams)",
        description:
            "Extending a simple susceptible–exposed–infection (SIR) model to further also allow for exposed and vaccinated states, in the logic of stock-flow diagrams",
    },
    {
        id: "example-models",
        title: "Example models",
        description:
            "Some ready-made models in various logics, of various complexity, and from various domains",
    },
];

/** Help page for all guides */
export default function GuidesHelpPage() {
    return <GuidesHelp guides={guidesList} />;
}

function GuidesHelp(props: {
    guides: Guide[];
}) {
    return (
        <>
            <GuidesContent />

            <dl>
                <For each={props.guides}>
                    {(guide, _) => (
                        <>
                            <dt>
                                <A href={`${guide.id}`}>{guide.title}</A>
                            </dt>
                            <dd>{guide.description}</dd>
                        </>
                    )}
                </For>
            </dl>
        </>
    );
}
