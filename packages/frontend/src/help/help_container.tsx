import type { JSX } from "solid-js";

import { BrandedToolbar } from "../page/toolbar";

import "./help_container.css";

export default function HelpContainer(props: {
    children?: JSX.Element;
}) {
    return (
        <div class="growable-container">
            <BrandedToolbar />
            <div class="page-container help-container">{props.children}</div>
        </div>
    );
}
