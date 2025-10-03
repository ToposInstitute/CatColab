import Tooltip from "@corvu/tooltip";
import { autofocus } from "@solid-primitives/autofocus";
import { A } from "@solidjs/router";
import { type ComponentProps, Match, Show, Switch, createResource, createSignal } from "solid-js";
import * as uuid from "uuid";
autofocus;

import { FieldError, IconButton } from "catcolab-ui-components";
import type { Document, Uuid } from "catlog-wasm";
import { useApi } from "../api";

import Pencil from "lucide-solid/icons/pencil";

import "./document_picker.css";

/** Dual-mode component to display and pick a document. */
export function DocumentPicker(props: {
    refId: Uuid | null;
    setRefId: (refId: Uuid | null) => void;
    docType?: Document["type"];
    placeholder?: string;
}) {
    const api = useApi();

    // TODO: API should cache mapping from ref ID to Automerge doc URL to avoid
    // hitting the backend too frequently.
    const [liveDoc] = createResource(
        () => props.refId,
        (refId) => api.getLiveDoc(refId),
    );

    const [editMode, setEditMode] = createSignal(false);
    const enableEditMode = () => setEditMode(true);
    const disableEditMode = () => setEditMode(false);

    const DocLink = (linkProps: ComponentProps<"a">) => (
        <Switch>
            <Match when={props.refId == null}>
                <a class="placeholder" onClick={enableEditMode} {...linkProps}>
                    {props.placeholder}
                </a>
            </Match>
            <Match when={liveDoc()}>
                {(liveDoc) => (
                    <A href={`/${liveDoc().doc.type}/${liveDoc().docRef?.refId}`} {...linkProps}>
                        {liveDoc().doc.name}
                    </A>
                )}
            </Match>
        </Switch>
    );

    const EditableDocLink = () => (
        <Tooltip placement="bottom">
            <Tooltip.Anchor>
                <Tooltip.Trigger as={DocLink} />
            </Tooltip.Anchor>
            <Tooltip.Portal>
                <Tooltip.Content class="popup document-picker-popup">
                    <IconButton onClick={enableEditMode}>
                        <Pencil />
                        {"Edit"}
                    </IconButton>
                </Tooltip.Content>
            </Tooltip.Portal>
        </Tooltip>
    );

    return (
        <div class="document-picker">
            <Show when={editMode()} fallback={<EditableDocLink />}>
                <RefInput
                    setRefId={(refId) => {
                        props.setRefId(refId);
                        disableEditMode();
                    }}
                    docType={props.docType}
                />
            </Show>
        </div>
    );
}

/** Input a document ref ID.

The UUID can be provided directly or extracted from a URL, which is more
convenient for copy-paste.
 */
function RefInput(props: {
    setRefId: (refId: Uuid | null) => void;
    docType?: Document["type"];
}) {
    const [inputText, setInputText] = createSignal("");
    const [errorText, setErrorText] = createSignal("");

    const handleInput = (text: string) => {
        text = text.trim();
        if (text === "") {
            props.setRefId(null);
            return;
        }

        if (URL.canParse(text)) {
            const url = new URL(text);
            text = url.pathname.split("/").pop() ?? "";
        }
        if (uuid.validate(text)) {
            props.setRefId(text);
        } else {
            setErrorText(`The ${props.docType ?? "document"} identifier is not valid`);
        }
    };

    return (
        <form
            onSubmit={(evt) => {
                evt.preventDefault();
                handleInput(inputText());
            }}
        >
            <input
                type="text"
                value={inputText()}
                onInput={(evt) => setInputText(evt.currentTarget.value)}
                use:autofocus
                autofocus
                placeholder="Enter URL"
            />
            <FieldError error={errorText()} />
        </form>
    );
}
