import Download from "lucide-solid/icons/download";
import type { JSX } from "solid-js";

import { IconButton } from "catcolab-ui-components";

/** Button to download an SVG with embedded fonts. */
export function DownloadSVGButton(props: {
    svg?: SVGSVGElement;
    filename?: string;
    tooltip?: JSX.Element | string;
    size?: number;
}) {
    const download = async () => {
        if (props.svg) {
            const { downloadSVG } = await import("./export_svg");
            await downloadSVG(props.svg, props.filename ?? "export.svg");
        }
    };

    return (
        <IconButton onClick={download} disabled={!props.svg} tooltip={props.tooltip}>
            <Download size={props.size} />
        </IconButton>
    );
}
