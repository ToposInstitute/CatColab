import { A, useNavigate } from "@solidjs/router";
import type { JSX } from "solid-js";

import { IconButton } from "../components";
import type { TheoryMeta } from "../theory";
import { DefaultAppMenu } from "./menubar";

import CircleHelp from "lucide-solid/icons/circle-help";

import "./toolbar.css";

/** Toolbar component. */
export function Toolbar(props: {
    children?: JSX.Element;
    class?: string;
}) {
    return <div class={`toolbar ${props.class ?? ""}`}>{props.children}</div>;
}

/** Toolbar with default application menu. */
export function DefaultToolbar(props: {
    children?: JSX.Element;
}) {
    return (
        <Toolbar>
            <DefaultAppMenu />
            <span class="filler" />
            {props.children}
        </Toolbar>
    );
}

/** Default toolbar with branding on the right. */
export function BrandedToolbar() {
    return (
        <DefaultToolbar>
            <Brand />
        </DefaultToolbar>
    );
}

const Brand = () => (
    <A class="brand" href="/">
        <img src="/topos_icon.png" alt="Topos Institute logo" />
        <span>CatColab</span>
    </A>
);

/** Button that navigates to the help page for a theory.

If no theory is set, it navigates instead to the list of all theories.
 */
export function TheoryHelpButton(props: {
    meta: TheoryMeta;
}) {
    const navigate = useNavigate();

    const tooltip = (meta: TheoryMeta) => (
        <>
            <p>
                {"You are using the logic: "}
                <strong>{meta.name}</strong>
            </p>
            <p>{"Click to learn more about this logic"}</p>
        </>
    );

    return (
        <IconButton
            onClick={() => navigate(`/help/logics/${props.meta.id}`)}
            tooltip={tooltip(props.meta)}
        >
            <CircleHelp />
        </IconButton>
    );
}
