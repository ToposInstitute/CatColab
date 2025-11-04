import type { JSX } from "solid-js";

import { IconButton } from "catcolab-ui-components";
import { downloadSVG } from "./export_svg";

import Download from "lucide-solid/icons/download";

/** Button to download an SVG. */
export function DownloadSVGButton(props: {
    svg?: SVGSVGElement;
    filename?: string;
    tooltip?: JSX.Element | string;
    size?: number;
}) {
    const download = () => {
        props.svg && downloadSVG(props.svg, props.filename ?? "export.svg");
    };

    return (
        <IconButton onClick={download} disabled={!props.svg} tooltip={props.tooltip}>
            <Download size={props.size} />
        </IconButton>
    );
}
