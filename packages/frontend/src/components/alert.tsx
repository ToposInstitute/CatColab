import { Alert } from "@kobalte/core/alert";
import type { JSX } from "solid-js";

import OctagonX from "lucide-solid/icons/octagon-x";
import TriangleAlert from "lucide-solid/icons/triangle-alert";

import "./alert.css";

/** Props for an alert component. */
export type AlertProps = {
    /** Title for the alert. */
    title?: string;

    children?: JSX.Element;
};

/** A warning alert. */
export const Warning = (props: AlertProps) => (
    <Alert class="alert alert-warning">
        <div class="alert-heading">
            <TriangleAlert />
            {props.title ?? "Warning"}
        </div>
        {props.children}
    </Alert>
);

/** An error alert.

Not called `Error` to avoid shadowing that name in JavaScript.
 */
export const ErrorAlert = (props: AlertProps) => (
    <Alert class="alert alert-error">
        <div class="alert-heading">
            <OctagonX />
            {props.title ?? "Error"}
        </div>
        {props.children}
    </Alert>
);

/** An info alert. */
export const Summary = (props: AlertProps) => (
    <Alert class="alert alert-summary">
        <div class="alert-heading">{props.title ?? "Summary"}</div>
        {props.children}
    </Alert>
);
