import Dialog, { Content, Portal } from "@corvu/dialog";
import { onMount } from "solid-js";

import { PermissionsError } from "../api";

import "./error_boundary.css";

export function ErrorBoundaryDialog(props: { error: Error }) {
    onMount(() => console.error(props.error));

    const heading = () => (props.error instanceof PermissionsError ? "Permissions Error" : "Error");
    const message = () =>
        props.error instanceof PermissionsError
            ? "You are not permitted to view this resource."
            : "An unknown error occurred.";

    return (
        <Dialog initialOpen={true}>
            <Portal>
                <Content class="popup error-dialog">
                    <h3>{heading()}</h3>
                    <p>{message()}</p>
                </Content>
            </Portal>
        </Dialog>
    );
}
