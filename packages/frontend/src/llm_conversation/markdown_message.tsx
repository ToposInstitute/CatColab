import remarkGfm from "remark-gfm";
import { SolidMarkdown } from "solid-markdown";

import "./markdown_message.css";

/** Render an assistant response as safe GitHub-flavored Markdown. */
export default function MarkdownMessage(props: { content: string }) {
    return (
        <div class="llm-markdown">
            <SolidMarkdown
                renderingStrategy="reconcile"
                remarkPlugins={[remarkGfm]}
                skipHtml
                disallowedElements={["a", "img"]}
                unwrapDisallowed
            >
                {props.content}
            </SolidMarkdown>
        </div>
    );
}
