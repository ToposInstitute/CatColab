/**
Get a handle to SVG DOM element once Solid has constructed it (using the ref mechanism)
Use XMLSerializer to write that DOM node to a string
Save that string as a file
 */
import computedStyleToInlineStyle from 'computed-style-to-inline-style';
import { handleExportSVG } from './graphviz_svg';

export function exportVisualizationSVG(visualization: HTMLDivElement) {
    computedStyleToInlineStyle(visualization, { recursive: true });

    // ref equivalent of get document element by ID 
    var serializer = new XMLSerializer()
    var source = serializer.serializeToString(visualization)
     // Add name spaces
     if (!source.match(/^<svg[^>]*?\sxmlns=(['"`])https?\:\/\/www\.w3\.org\/2000\/svg\1/)) {
        source = source.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"')
    }
    if (!source.match(/^<svg[^>]*?\sxmlns:xlink=(['"`])http\:\/\/www\.w3\.org\/1999\/xlink\1/)) {
        source = source.replace(/^<svg/, '<svg xmlns:xlink="http://www.w3.org/1999/xlink"')
    }
    // Add xml declaration
    source = '<?xml version="1.0" standalone="no"?>\r\n' + source

    // Convert SVG source to URI data scheme
    const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(source)

    const link = document.createElement("a");
    link.href = url;
    link.download = "visualization.svg"

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    console.log("SVG file download initiated");

}

// currently outputting a PNG with a question mark and not the diagram
export function exportVisualizationPNG() {
const svgElement = document.querySelector('svg');
    if (svgElement) {
      const svgData = new XMLSerializer().serializeToString(svgElement);
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();
      img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;
        ctx?.drawImage(img, 0, 0);
        canvas.toBlob((blob) => {
          if (blob) {
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = 'visualization.png';
            link.click();
            URL.revokeObjectURL(url);
          }
        }, 'image/png');
      };
      img.src = 'data:image/svg+xml;base64,' + btoa(svgData);
    }
}