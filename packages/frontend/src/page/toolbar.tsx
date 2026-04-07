import { A, useNavigate } from "@solidjs/router";
import CircleHelp from "lucide-solid/icons/circle-help";
import { type JSX, useContext } from "solid-js";
import invariant from "tiny-invariant";

import { IconButton } from "catcolab-ui-components";
import { TheoryLibraryContext, type TheoryMeta } from "../theory";
import { DefaultAppMenu } from "./menubar";

import "./toolbar.css";

/** Toolbar component. */
export function Toolbar(props: { children?: JSX.Element; class?: string }) {
    return <div class={`toolbar ${props.class ?? ""}`}>{props.children}</div>;
}

/** Toolbar with default application menu. */
export function DefaultToolbar(props: { children?: JSX.Element }) {
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
function theoryHelpTooltip(meta: TheoryMeta) {
    return (
        <>
            <p>
                {"You are using the logic: "}
                <strong>{meta.name}</strong>
            </p>
            <p>{"Click to learn more about this logic"}</p>
        </>
    );
}

export function TheoryHelpButton(props: { meta: TheoryMeta }) {
    const navigate = useNavigate();
    const theories = useContext(TheoryLibraryContext);
    invariant(theories, "Library of theories must be provided as context");

    const helpId = () => theories.getBaseTheoryId(props.meta.id) ?? props.meta.id;

    return (
        <IconButton
            onClick={() => navigate(`/help/logics/${helpId()}`)}
            tooltip={theoryHelpTooltip(props.meta)}
        >
            <CircleHelp />
        </IconButton>
    );
}
