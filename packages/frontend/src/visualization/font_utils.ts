import invariant from "tiny-invariant";

/** Get the main font string for text measurement.
 *
 * Returns a font specification string suitable for Canvas 2D context.
 */
export function getMainFont(): string {
    const style = getComputedStyle(document.documentElement);
    const rootFontSize = parseFloat(style.fontSize);
    return `${rootFontSize}px ${style.getPropertyValue("--main-font")}`;
}

/** Get the monospace font string for text measurement.
 *
 * Returns a font specification string suitable for Canvas 2D context.
 */
export function getMonoFont(): string {
    const style = getComputedStyle(document.documentElement);
    const rootFontSize = parseFloat(style.fontSize);
    return `${rootFontSize}px ${style.getPropertyValue("--mono-font")}`;
}

/** Measures the bounding box of text to be rendered in SVG.
 *
 * This method uses an auxiliary HTML canvas element. The other commonly used
 * method uses an actual SVG node but has the disadvantage that the SVG node must
 * be added to the DOM.
 */
export function measureText(
    canvas: HTMLCanvasElement,
    text: string,
    font: string,
): { width: number; height: number } {
    const context = canvas.getContext("2d");
    invariant(context, "Failed to get 2D context from canvas");
    context.font = font;
    const metrics = context.measureText(text);
    return {
        width: metrics.width,
        height: metrics.fontBoundingBoxAscent + metrics.fontBoundingBoxDescent,
    };
}
