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
    | "plusCaesura"
    | "minusCaesura"
<<<<<<< HEAD
    | "plusDeg"
    | "minusDeg"
    | "plusDelay"
    | "minusDelay"
    | "plusDegDelay"
    | "minusDegDelay"
=======
    | "plusOne"
    | "minusOne"
    | "plusDelay"
    | "minusDelay"
>>>>>>> 3060eab (theory of ECLDs (replacing CLDs with differential degree))
    | "scalar";

/** Prop for forwarding a ref to an `<svg>` element.
 */
export type SVGRefProp = SVGSVGElement | Setter<SVGSVGElement | undefined>;
