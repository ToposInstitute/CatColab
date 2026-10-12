import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { SolidMarkdown } from "solid-markdown";

import "katex/dist/katex.min.css";
import styles from "./markdown_message.module.css";

/** Render Markdown content, such as a message from an LLM. */
export function MarkdownMessage(props: { content: string }) {
    return (
        <SolidMarkdown
            class={styles.message}
            renderingStrategy="reconcile"
            remarkPlugins={remarkPlugins}
            rehypePlugins={rehypePlugins}
        >
            {props.content}
        </SolidMarkdown>
    );
}

export default MarkdownMessage;

const remarkPlugins = [remarkGfm, remarkMath];
const rehypePlugins = [rehypeKatex];
