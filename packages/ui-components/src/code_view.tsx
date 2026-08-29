import { type BundledLanguage, type BundledTheme, codeToHtml } from "shiki";
import { createResource, Suspense } from "solid-js";

export type CodeViewProps = {
    text: string;
    lang: BundledLanguage;
    theme?: BundledTheme;
};

export const CodeView = (props: CodeViewProps) => {
    const [html] = createResource(
        () => ({ text: props.text, lang: props.lang, theme: props.theme }),
        ({ text, lang, theme }) =>
            codeToHtml(text, {
                lang,
                theme: theme ?? "min-light",
            }),
    );

    return (
        <Suspense fallback={<pre>{props.text}</pre>}>
            {/* shiki uses hast-util-to-html which escapes html entities so no need
            for extra sanitization and setting innerHTML should be safe */}
            {/* oxlint-disable-next-line solid/no-innerhtml */}
            <div innerHTML={html()} />
        </Suspense>
    );
};
