import rough from "roughjs";
import { onCleanup, onMount, splitProps, type JSX } from "solid-js";

import styles from "./Rough.module.css";

type SketchBoxProps = JSX.HTMLAttributes<HTMLDivElement> & {
    seed?: number;
    roughness?: number;
    fill?: string;
};

/** A resize-aware Rough.js frame for surfaces not covered by Wired Elements. */
export function SketchBox(props: SketchBoxProps) {
    const [sketch, elementProps] = splitProps(props, ["seed", "roughness", "fill", "children"]);
    let root!: HTMLDivElement;
    let svg!: SVGSVGElement;
    let resizeObserver: ResizeObserver | undefined;

    const draw = () => {
        const { width, height } = root.getBoundingClientRect();
        if (width < 2 || height < 2) {
            return;
        }
        svg.replaceChildren();
        svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
        const drawing = rough.svg(svg);
        svg.append(
            drawing.rectangle(3, 3, Math.max(0, width - 6), Math.max(0, height - 6), {
                seed: sketch.seed ?? 17,
                roughness: sketch.roughness ?? 1.35,
                bowing: 1.1,
                stroke: getComputedStyle(root).color,
                strokeWidth: 1.25,
                fill: sketch.fill,
                fillStyle: sketch.fill ? "hachure" : undefined,
                hachureGap: 7,
                fillWeight: 0.7,
            }),
        );
    };

    onMount(() => {
        draw();
        resizeObserver = new ResizeObserver(draw);
        resizeObserver.observe(root);
    });
    onCleanup(() => resizeObserver?.disconnect());

    return (
        <div ref={root} {...elementProps}>
            <svg ref={svg} class={styles.overlay} aria-hidden="true" />
            <div class={styles.content}>{sketch.children}</div>
        </div>
    );
}

/** A hand-drawn arrow that scales with the schema morphism name above it. */
export function SketchArrow() {
    let svg!: SVGSVGElement;
    let resizeObserver: ResizeObserver | undefined;

    const draw = () => {
        const width = svg.getBoundingClientRect().width;
        if (width < 4) {
            return;
        }
        svg.replaceChildren();
        svg.setAttribute("viewBox", `0 0 ${width} 12`);
        const drawing = rough.svg(svg);
        const options = { seed: 31, roughness: 1.15, bowing: 0.9, strokeWidth: 1.4 };
        svg.append(
            drawing.line(1, 6, width - 2, 6, options),
            drawing.line(width - 9, 1, width - 2, 6, { ...options, seed: 32 }),
            drawing.line(width - 9, 11, width - 2, 6, { ...options, seed: 33 }),
        );
    };

    onMount(() => {
        draw();
        resizeObserver = new ResizeObserver(draw);
        resizeObserver.observe(svg);
    });
    onCleanup(() => resizeObserver?.disconnect());

    return <svg ref={svg} class={styles.arrow} aria-hidden="true" />;
}

/** A Rough.js wave pinned to one edge of its positioned parent. */
export function SketchSeparator(props: {
    edge: "top" | "right" | "bottom" | "left";
    seed?: number;
}) {
    let svg!: SVGSVGElement;
    let resizeObserver: ResizeObserver | undefined;
    const vertical = () => props.edge === "left" || props.edge === "right";

    const draw = () => {
        const { width, height } = svg.getBoundingClientRect();
        const length = vertical() ? height : width;
        if (length < 2) {
            return;
        }
        svg.replaceChildren();
        svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
        const center = vertical() ? width / 2 : height / 2;
        const points: Array<[number, number]> = [];
        for (let position = -12; position <= length + 12; position += 10) {
            const offset = Math.sin((position / 48) * Math.PI * 2) * 0.6;
            points.push(vertical() ? [center + offset, position] : [position, center + offset]);
        }
        const drawing = rough.svg(svg);
        svg.append(
            drawing.curve(points, {
                seed: props.seed ?? 71,
                roughness: 0.75,
                bowing: 0.25,
                stroke: "currentColor",
                strokeWidth: 1.2,
                disableMultiStroke: true,
            }),
        );
    };

    onMount(() => {
        draw();
        resizeObserver = new ResizeObserver(draw);
        resizeObserver.observe(svg);
    });
    onCleanup(() => resizeObserver?.disconnect());

    return <svg ref={svg} class={`${styles.separator} ${styles[props.edge]}`} aria-hidden="true" />;
}
