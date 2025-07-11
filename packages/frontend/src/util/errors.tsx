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

    return <ErrorMessage error={props.error} />;
}

export function ErrorBoundaryPage(props: { error: Error }) {
    console.error(props.error);

    return (
        <div class="error-page">
            <DefaultToolbar />
            <ErrorMessage error={props.error} />
        </div>
    );
}

export function ErrorMessage(props: { error: Error }) {
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
        <div class="error-boundary">
            <div>
                <h3>{heading}</h3>
                <p>{message}</p>
            </div>
        </div>
    );
}
