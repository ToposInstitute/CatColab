import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { SolidMarkdown } from "solid-markdown";

/** Render Markdown content, such as a message from the LLM. */
export default function MarkdownMessage(props: { content: string }) {
    return (
        <SolidMarkdown
            class="markdown-message"
            renderingStrategy="reconcile"
            remarkPlugins={remarkPlugins}
            rehypePlugins={rehypePlugins}
        >
            {props.content}
        </SolidMarkdown>
    );
}

/** Support GitHub-flavored Markdown, plus math as rendered in MDX help pages. */
const remarkPlugins = [remarkGfm, remarkMath];
const rehypePlugins = [rehypeKatex];
