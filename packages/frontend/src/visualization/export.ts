import computedStyleToInlineStyle from "computed-style-to-inline-style";
import download from "js-file-download";

/** Export an `<svg>` element with inlined CSS styles.

Returns the source of an SVG document.
 */
export function exportSVG(svg: SVGSVGElement): string {
    computedStyleToInlineStyle(svg, { recursive: true });

    const serializer = new XMLSerializer();
    let source = serializer.serializeToString(svg);

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
