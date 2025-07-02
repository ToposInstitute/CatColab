import { A } from "@solidjs/router";
import { For } from "solid-js";
import GuidesContent from "./guides.mdx";

export type Guide = {
    id: string;
    title: string;
}

export const guidesList: Guide[] = [
    {
        id: "example-models",
        title: "Example models",
    },
    {
        id: "predator-prey",
        title: "Predator–prey (causal loop diagrams)",
    },
    {
        id: "seirv",
        title: "SEIRV (stock and flow)",
    }
]

/** Help page for all guides */
export default function GuidesHelpPage() {
    return <GuidesHelp guides={guidesList} />;
}

function GuidesHelp(props: {
    guides: {
        id: string,
        title: string,
    }[];
}) {
    return (
        <>
            <GuidesContent />

            <ul>
            <For each={props.guides}>
                {(guide, _) =>
                <li>
                    <A href={`${guide.id}`}>{guide.title}</A>
                </li>
                }
            </For>
            </ul>
        </>
    );
}
