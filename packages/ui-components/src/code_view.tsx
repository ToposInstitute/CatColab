import { codeToHtml } from "shiki";
import { createResource } from "solid-js";

type CodeViewProps = {
    text: string;
    language: string;
};

export type CodeViewOptions = CodeViewProps & {
    placeholder?: string;
};

export const CodeView = (props: CodeViewOptions) => {
    const [html] = createResource(() =>
        codeToHtml(props.text, {
            lang: props.language,
            theme: "min-light",
        }),
    );

    // oxlint-disable-next-line solid/no-innerhtml -- shiki uses hast-util-to-html which escapes html entitites so no need for extra sanitization and setting innerHTML should be safe
    return <div innerHTML={html()} />;
};
