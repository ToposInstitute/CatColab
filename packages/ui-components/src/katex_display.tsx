import katex from "katex";
import { createEffect } from "solid-js";

import "katex/dist/katex.min.css";

/** Component for rendering KaTeX math expressions. */
export function KatexDisplay(props: { math: string; displayMode?: boolean }) {
    let container!: HTMLDivElement;

    const renderMath = () => {
        try {
            katex.render(props.math, container, {
                displayMode: props.displayMode ?? true,
                throwOnError: false,
                trust: true,
            });
        } catch (error) {
            console.error("KaTeX rendering error:", error);
            container.textContent = `Error rendering math: ${error}`;
        }
    };

    createEffect(() => {
        // Track the math prop for reactivity
        props.math;
        renderMath();
    });

    return <div ref={container} />;
}
