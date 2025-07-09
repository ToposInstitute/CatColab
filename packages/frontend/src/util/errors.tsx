import Dialog, { Content, Portal } from "@corvu/dialog";
import { DefaultToolbar } from "../page/toolbar";
import { useContext } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { IconButton } from "../components";
import { createModel } from "../model/document";
import { useApi } from "../api";
import CircleArrowLeft from "lucide-solid/icons/circle-arrow-left";
import { TheoryLibraryContext } from "../stdlib";
import invariant from "tiny-invariant";

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

	const api = useApi();
	const navigate = useNavigate();
	const theories = useContext(TheoryLibraryContext);
	invariant(theories, "Theory library must be provided as context");
	const onNewModel = async () => {
	  const newRef = await createModel(api, theories.getDefault().id);
	  navigate(`/model/${newRef}`);
	};

    return (
	  <div>
		<IconButton
            onClick={onNewModel}
        >
            <CircleArrowLeft />
        </IconButton>
        <Dialog initialOpen={true}>
            <Portal>
                <Content class="popup error-dialog">
                    <h3>{heading}</h3>
                    <p>{message}</p>
                </Content>
            </Portal>
        </Dialog>
	  </div>
    );
}
