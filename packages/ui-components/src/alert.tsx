import { Alert } from "@kobalte/core/alert";
import Info from "lucide-solid/icons/info";
import MessageCircleQuestion from "lucide-solid/icons/message-circle-question";
import OctagonX from "lucide-solid/icons/octagon-x";
import TriangleAlert from "lucide-solid/icons/triangle-alert";
import type { JSX } from "solid-js";

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

/** A note alert. */
export const Note = (props: AlertProps) => (
    <Alert class="alert alert-note">
        <div class="alert-heading">
            <Info />
            {props.title ?? "Note"}
        </div>
        {props.children}
    </Alert>
);

/** A question alert. */
export const Question = (props: AlertProps) => (
    <Alert class="alert alert-question">
        <div class="alert-heading">
            <MessageCircleQuestion />
            {props.title ?? "Question"}
        </div>
        {props.children}
    </Alert>
);
