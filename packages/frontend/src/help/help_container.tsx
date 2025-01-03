import type { JSX } from "solid-js";

import { BrandedToolbar } from "../page/toolbar";

import "./help_container.css";

export default function HelpContainer(props: {
    children?: JSX.Element;
}) {
    return (
        <div class="growable-container">
            <BrandedToolbar />
            <div class="help-container">{props.children}</div>
        </div>
    );
}
