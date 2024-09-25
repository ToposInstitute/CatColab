import { useNavigate } from "@solidjs/router";
import CircleHelp from "lucide-solid/icons/circle-help";
import type { JSX } from "solid-js";

import { IconButton } from "../components";

import "./toolbar.css";

/** Toolbar component. */
export function Toolbar(props: {
    children: JSX.Element;
}) {
    return <div class="toolbar">{props.children}</div>;
}

/** Toolbar with branding on the left. */
export function BrandedToolbar(props: {
    children: JSX.Element;
}) {
    return (
        <Toolbar>
            <span class="filler" />
            {props.children}
        </Toolbar>
    );
}

/** Button that navigates to the root help page. */
export function HelpButton() {
    const navigate = useNavigate();

    return (
        <IconButton onClick={() => navigate("/help")} tooltip="Get help about CatColab">
            <CircleHelp />
        </IconButton>
    );
}
