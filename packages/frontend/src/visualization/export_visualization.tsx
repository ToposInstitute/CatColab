/**
Get a handle to SVG DOM element once Solid has constructed it (using the ref mechanism)
Use XMLSerializer to write that DOM node to a string
Save that string as a file
 */
import computedStyleToInlineStyle from "computed-style-to-inline-style";

export function exportVisualizationSVG(visualization: HTMLDivElement) {
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
    source = `<?xml·version="1.0"·standalone="no"?>\r\n${source}`;

    // Convert SVG source to URI data scheme
    const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`;

    const link = document.createElement("a");
    link.href = url;
    link.download = "visualization.svg";

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    console.log("SVG file download initiated");
}
