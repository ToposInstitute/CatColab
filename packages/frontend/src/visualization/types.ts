import type { Setter } from "solid-js";

/** Style of arrow.

Each arrow style has support to be rendered in HTML/CSS and SVG.
 */
export type ArrowStyle =
    | "default"
    | "double"
    | "flat"
    | "unmarked"
    | "plus"
    | "minus"
    | "indeterminate"
    | "plusCaesura"
    | "minusCaesura"
    | "scalar"
    | "doubleLess"
    | "doubleMore";

/** Prop for forwarding a ref to an `<svg>` element.
 */
export type SVGRefProp = SVGSVGElement | Setter<SVGSVGElement | undefined>;
