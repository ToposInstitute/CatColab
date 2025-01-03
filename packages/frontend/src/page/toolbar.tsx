import { A, useNavigate } from "@solidjs/router";
import { type JSX, useContext } from "solid-js";
import invariant from "tiny-invariant";

import { IconButton } from "../components";
import { TheoryLibraryContext } from "../stdlib";
import type { Theory } from "../theory";

import CircleHelp from "lucide-solid/icons/circle-help";

import "./toolbar.css";

/** Toolbar component. */
export function Toolbar(props: {
    children?: JSX.Element;
}) {
    return <div class="toolbar">{props.children}</div>;
}

/** Toolbar with branding on the left. */
export function BrandedToolbar(props: {
    children?: JSX.Element;
}) {
    return (
        <Toolbar>
            <Brand />
            <span class="filler" />
            {props.children}
        </Toolbar>
    );
}

const Brand = () => (
    <A class="brand" href="/">
        <img src="/topos_icon.png" alt="Topos Institute logo" />
        <span>CatColab</span>
    </A>
);

/** Button that navigates to the help page for a theory.

If no theory is set, it naviagtes instead to the list of all theories.
 */
export function TheoryHelpButton(props: {
    theory?: Theory;
}) {
    const navigate = useNavigate();

    const theories = useContext(TheoryLibraryContext);
    invariant(theories);
    const theory = (): Theory => props.theory ?? theories.getDefault();

    const tooltip = (theory: Theory) => (
        <>
            <p>
                {"You are using the logic: "}
                <strong>{theory.name}</strong>
            </p>
            <p>{"Learn more about this logic"}</p>
        </>
    );

    return (
        <IconButton
            onClick={() => navigate(`/help/theory/${theory().id}`)}
            tooltip={tooltip(theory())}
        >
            <CircleHelp />
        </IconButton>
    );
}
