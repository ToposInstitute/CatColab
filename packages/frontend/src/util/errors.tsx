import Dialog, { Content, Portal } from "@corvu/dialog";

import "./errors.css";

export class PermissionsError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "AuthorizationError";
    }
}

export function ErrorBoundaryDialog(props: { error: Error }) {
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
        <Dialog initialOpen={true}>
            <Portal>
                <Content class="popup error-dialog">
                    <h3>{heading}</h3>
                    <p>{message}</p>
                </Content>
            </Portal>
        </Dialog>
    );
}
