import download from "js-file-download";

/** Export an `<svg>` element with inlined CSS styles.

Returns the source of an SVG document.
 */
export function exportSVG(svg: SVGSVGElement): string {
    const serializer = new XMLSerializer();
    const node = computedStyleToInlineStyle(svg);
    let source = serializer.serializeToString(node);

    // Add XML namespaces.
    if (!source.match(/^<svg[^>]*?\sxmlns=(['"`])https?\:\/\/www\.w3\.org\/2000\/svg\1/)) {
        source = source.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
    }
    if (!source.match(/^<svg[^>]*?\sxmlns:xlink=(['"`])http\:\/\/www\.w3\.org\/1999\/xlink\1/)) {
        source = source.replace(/^<svg/, '<svg xmlns:xlink="http://www.w3.org/1999/xlink"');
    }

    // Add XML header.
    source = `<?xml version="1.0" encoding="utf-8"?>\n${source}`;

    return source;
}

/** Export and then download an `<svg>` element.
 */
export function downloadSVG(svg: SVGSVGElement, filename: string) {
    const source = exportSVG(svg);
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
        // biome-ignore lint/suspicious/noExplicitAny: types are busted?
        cloned.style[property as any] = computedStyle.getPropertyValue(property);
    }
}

type StylableElement = HTMLElement | SVGElement;
