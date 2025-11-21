import type { LucideProps, SVGAttributes } from "lucide-solid";
import { splitProps } from "solid-js";

export const theoryToLetterMap: Record<string, [string, string]> = {
    empty: ["I", "n"],
    "simple-olog": ["O", "l"],
    "simple-schema": ["S", "c"],
    "petri-net": ["P", "n"],
    "causal-loop": ["C", "l"],
    "causal-loop-delays": ["C", "d"],
    "indeterminate-causal-loop": ["C", "i"],
    "primitive-stock-flow": ["S", "f"],
    "reg-net": ["R", "n"],
    "unary-dec": ["D", "c"],
    "power-system": ["P", "s"],
};

const defaultAttributes: SVGAttributes = {
    xmlns: "http://www.w3.org/2000/svg",
    width: 24,
    height: 24,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": 2,
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
};

interface ModelFileIconProps {
    theory: string;
}

export function ModelFileIcon(props: LucideProps & ModelFileIconProps) {
    const [localProps, rest] = splitProps(props, [
        "absoluteStrokeWidth",
        "children",
        "class",
        "color",
        "theory",
        "size",
        "strokeWidth",
    ]);
    const letters = () => theoryToLetterMap[localProps.theory] ?? [" ", " "];
    return (
        <svg
            {...defaultAttributes}
            width={localProps.size ?? defaultAttributes.width}
            height={localProps.size ?? defaultAttributes.height}
            stroke={localProps.color ?? defaultAttributes.stroke}
            stroke-width={
                localProps.absoluteStrokeWidth
                    ? (Number(localProps.strokeWidth ?? defaultAttributes["stroke-width"]) * 24) /
                      Number(localProps.size)
                    : Number(localProps.strokeWidth ?? defaultAttributes["stroke-width"])
            }
            class={mergeClasses(
                "lucide",
                "lucide-icon",
                "lucide-file-catcolab",
                localProps.class != null ? localProps.class : "",
            )}
            {...rest}
        >
            <path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z" />
            <path d="m14 2v5a1 1 0 0 0 1 1h5" />
            <text
                x="13.777838"
                y="18.049967"
                font-size="12.82px"
                stroke-width=".641"
                text-align="end"
                text-anchor="end"
                font-family="'Source Code Pro'"
                fill={localProps.color ?? defaultAttributes.stroke}
            >
                {letters()[0]}
            </text>
            <text
                x="18.3403"
                y="18.089581"
                font-size="7.961px"
                stroke-width=".39806"
                text-align="end"
                text-anchor="end"
                font-family="'Source Code Pro'"
                fill={localProps.color ?? defaultAttributes.stroke}
            >
                {letters()[1]}
            </text>
        </svg>
    );
}
