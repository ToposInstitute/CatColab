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
        id: "fundamentals",
        title: "Fundamentals of CatColab",
        description:
            'What do we mean by "formal, interoperable, conceptual modeling", and how does CatColab implement this?',
    },
    {
        id: "example-models",
        title: "Ready-made models",
        description:
            "Some ready-made models in various logics, of various complexity, and from various domains",
    },
];

/** Help page for all guides */
export default function GuidesHelpPage() {
    return <GuidesHelp guides={guidesList} />;
}

function GuidesHelp(props: { guides: Guide[] }) {
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
