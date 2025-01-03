import { A, useNavigate } from "@solidjs/router";
import { type JSX, Show } from "solid-js";

import { IconButton } from "../components";
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

    const defaultButton = () => {
        const tooltip = (
            <>
                <p>{"You have not selected a logic"}</p>
                <p>{"Learn more about logics"}</p>
            </>
        );
        return (
            <IconButton onClick={() => navigate("/help/theories")} tooltip={tooltip}>
                <CircleHelp />
            </IconButton>
        );
    };

    const tooltip = (theoryName: string) => (
        <>
            <p>
                {"You are using the logic: "}
                <strong>{theoryName}</strong>
            </p>
            <p>{"Learn more about this logic"}</p>
        </>
    );

    return (
        <Show when={props.theory} fallback={defaultButton()}>
            {(theory) => (
                <IconButton
                    onClick={() => navigate(`/help/theory/${theory().id}`)}
                    tooltip={tooltip(theory().name)}
                >
                    <CircleHelp />
                </IconButton>
            )}
        </Show>
    );
}
