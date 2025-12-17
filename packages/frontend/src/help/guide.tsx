import { useParams } from "@solidjs/router";
import { createResource, Show } from "solid-js";
import { Dynamic } from "solid-js/web";

import { guidesList } from "./guides";

/** Help page of a guide */
export default function GuideHelpPage() {
    const params = useParams();
    return <GuideHelp id={params.id} />;
}

/** Contents of the guide page */
export function GuideHelp(props: { id?: string }) {
    // Note that guide should never be undefined, due to existingGuideFilter
    // in routes.ts
    const guide = () => guidesList.find((item) => item.id === props.id);

    const [content] = createResource(
        () => props.id,
        async (guideId) => {
            if (!guideId) {
                return null;
            }
            return await import(`./guide/${guideId}.mdx`);
        },
    );

    return (
        <>
            <h1>
                <a href="/help/guides/">Guides</a> / {guide()?.title}
            </h1>
            <p>
                <i>{guide()?.description}</i>
            </p>
            <Show when={content()}>{(module) => <Dynamic component={module().default} />}</Show>
        </>
    );
}
