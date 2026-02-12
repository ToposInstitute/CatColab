import download from "js-file-download";

import GoogleFontInliner from "../util/google_font_inliner";

/** Export an `<svg>` element with inlined CSS styles and embedded fonts.

Returns the source of an SVG document.
 */
export async function exportSVG(svg: SVGSVGElement): Promise<string> {
    const serializer = new XMLSerializer();
    const node = computedStyleToInlineStyle(svg);
    let source = serializer.serializeToString(node);

    // Add XML namespaces.
    if (!source.match(/^<svg[^>]*?\sxmlns=(['"`])https?:\/\/www\.w3\.org\/2000\/svg\1/)) {
        source = source.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
    }
    if (!source.match(/^<svg[^>]*?\sxmlns:xlink=(['"`])http:\/\/www\.w3\.org\/1999\/xlink\1/)) {
        source = source.replace(/^<svg/, '<svg xmlns:xlink="http://www.w3.org/1999/xlink"');
    }

    // Embed fonts.
    const fontCss = await getFontFacesCSS();
    if (fontCss) {
        // Insert font-face rules in a <style> element at the beginning of the SVG
        source = source.replace(
            /^(<svg[^>]*>)/,
            `$1\n<style type="text/css">\n${fontCss}\n</style>`,
        );
    }

    // Add XML header.
    source = `<?xml version="1.0" encoding="utf-8"?>\n${source}`;

    return source;
}

/** Export and then download an `<svg>` element.
 */
export async function downloadSVG(svg: SVGSVGElement, filename: string) {
    const source = await exportSVG(svg);
    return download(source, filename, "image/svg+xml");
}

/** Convert an HTML or SVG element's style from computed to inline.

Adapted from <https://github.com/lukehorvat/computed-style-to-inline-style>
but fixed to avoid mutating the original DOM node: see issue 4 on that repo.
 */
export function computedStyleToInlineStyle(element: StylableElement): Node {
    const cloned = element.cloneNode(true);
    recurseComputedStyleToInlineStyle(element, cloned as StylableElement);
    return cloned;
}

function recurseComputedStyleToInlineStyle(element: StylableElement, cloned: StylableElement) {
    for (let i = 0; i < element.children.length; i++) {
        recurseComputedStyleToInlineStyle(
            element.children[i] as StylableElement,
            cloned.children[i] as StylableElement,
        );
    }

    const computedStyle = getComputedStyle(element);
    for (const property of computedStyle) {
        cloned.style.setProperty(property, computedStyle.getPropertyValue(property));
    }
}

type StylableElement = HTMLElement | SVGElement;

/** Extract and embed font-face definitions for main application fonts.
 *
 * Reads the --main-font and --mono-font CSS custom properties from :root,
 * extracts the first font family from each, and embeds them using google_font_inliner.
 */
async function getFontFacesCSS(): Promise<string> {
    const fontStyles: string[] = [];

    const rootStyle = getComputedStyle(document.documentElement);
    const mainFont = rootStyle.getPropertyValue("--main-font").trim();
    const monoFont = rootStyle.getPropertyValue("--mono-font").trim();

    const extractFirstFont = (fontFamily: string): string | null => {
        if (!fontFamily) {
            return null;
        }
        const firstFont = fontFamily.split(",")[0]?.trim();
        return firstFont ? firstFont.replace(/['"]/g, "") : null;
    };

    const mainFontName = extractFirstFont(mainFont);
    const monoFontName = extractFirstFont(monoFont);

    if (mainFontName) {
        const mainInliner = new GoogleFontInliner(mainFontName);
        const mainCss = await mainInliner.style();
        fontStyles.push(mainCss);
    }

    if (monoFontName && monoFontName !== mainFontName) {
        const monoInliner = new GoogleFontInliner(monoFontName);
        const monoCss = await monoInliner.style();
        fontStyles.push(monoCss);
    }

    return fontStyles.join("\n\n");
}
