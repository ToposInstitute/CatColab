import katex from "katex";
import { createEffect } from "solid-js";

import "katex/dist/katex.min.css";

/** Component for rendering KaTeX math expressions. */
export function KatexDisplay(props: { math: string }) {
    let container!: HTMLDivElement;

    const renderMath = (math: string) => {
        try {
            katex.render(math, container, {
                displayMode: false,
                throwOnError: false,
                trust: false,
            });
        } catch (error) {
            console.error("KaTeX rendering error:", error);
            container.textContent = `Error rendering math: ${error}`;
        }
    };

    createEffect(() => {
        renderMath(props.math);
    });

    return <div ref={container} />;
}
