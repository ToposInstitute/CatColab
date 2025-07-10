import { DefaultToolbar } from "../page/toolbar";

import "./errors.css";

export class PermissionsError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "AuthorizationError";
    }
}

export function ErrorBoundaryMessage(props: { error: Error }) {
    console.error(props.error);

    let heading: string;
    let message: string;

    if (props.error instanceof PermissionsError) {
        heading = "Permissions Error";
        message = "You are not permitted to view this resource.";
    } else {
        heading = "Error";
        message = "An unknown error occurred.";
    }

    return <ErrorMessage heading={heading} message={message} />;
}

export function ErrorBoundaryPage(props: { error: Error }) {
    console.error(props.error);

    let heading: string;
    let message: string;

    if (props.error instanceof PermissionsError) {
        heading = "Permissions Error";
        message = "You are not permitted to view this resource.";
    } else {
        heading = "Error";
        message = "An unknown error occurred.";
    }

    return (
        <div class="error-page">
            <DefaultToolbar />
            <ErrorMessage heading={heading} message={message} />
        </div>
    );
}

export function ErrorMessage(props: { heading: string; message: string }) {
    return (
        <div class="error-boundary">
            <div>
                <h3>{props.heading}</h3>
                <p>{props.message}</p>
            </div>
        </div>
    );
}
