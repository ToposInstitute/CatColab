import computedStyleToInlineStyle from "computed-style-to-inline-style";

/** Export an `<svg>` element with inlined styles.
 */
export function exportVisualizationSVG(visualization: SVGSVGElement) {
    computedStyleToInlineStyle(visualization, { recursive: true });

    // ref equivalent of get document element by ID
    const serializer = new XMLSerializer();
    let source = serializer.serializeToString(visualization);
    // Add name spaces
    if (!source.match(/^<svg[^>]*?\sxmlns=(['"`])https?\:\/\/www\.w3\.org\/2000\/svg\1/)) {
        source = source.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
    }
    if (!source.match(/^<svg[^>]*?\sxmlns:xlink=(['"`])http\:\/\/www\.w3\.org\/1999\/xlink\1/)) {
        source = source.replace(/^<svg/, '<svg xmlns:xlink="http://www.w3.org/1999/xlink"');
    }
    // Add xml declaration
    source = `<?xml version="1.0" encoding="utf-8"?>\n${source}`;

    // Convert SVG source to URI data scheme
    const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`;

    const link = document.createElement("a");
    link.href = url;
    link.download = "visualization.svg";

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
