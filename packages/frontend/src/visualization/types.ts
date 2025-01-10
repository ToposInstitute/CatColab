import type { Setter } from "solid-js";

/** Style of arrow.

Each arrow style has support to be rendered in HTML/CSS and SVG.
 */
export type ArrowStyle =
    | "default"
    | "double"
    | "flat"
    | "plus"
    | "minus"
    | "indeterminate"
	| "plusDelayed"
	| "minusDelayed"
    | "scalar";

/** Prop for forwarding a ref to an `<svg>` element.
 */
export type SVGRefProp = SVGSVGElement | Setter<SVGSVGElement | undefined>;
