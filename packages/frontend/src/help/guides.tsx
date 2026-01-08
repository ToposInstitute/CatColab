import { Title } from "@solidjs/meta";
import { A } from "@solidjs/router";
import { For } from "solid-js";

import GuidesContent from "./guides.mdx";
import { type Guide, guidesList } from "./guides_list";

/** Help page for all guides */
export default function GuidesHelpPage() {
    const appTitle = import.meta.env.VITE_APP_TITLE;

    return (
        <>
            <Title>Guides - {appTitle}</Title>
            <GuidesHelp guides={guidesList} />
        </>
    );
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
