import Tooltip from "@corvu/tooltip";
import { A } from "@solidjs/router";
import {
    type ComponentProps,
    Match,
    Show,
    Switch,
    createEffect,
    createResource,
    createSignal,
    splitProps,
} from "solid-js";
import * as uuid from "uuid";

import { FieldError, IconButton, TextInput, type TextInputOptions } from "catcolab-ui-components";
import type { Document, Uuid } from "catlog-wasm";
import { useApi } from "../api";

import Pencil from "lucide-solid/icons/pencil";

import "./document_picker.css";

/** Dual-mode component to display and pick a document. */
export function DocumentPicker(
    allProps: TextInputOptions & {
        refId: Uuid | null;
        setRefId: (refId: Uuid | null) => void;
        docType?: Document["type"];
        placeholder?: string;
    },
) {
    const [props, inputOptions] = splitProps(allProps, [
        "refId",
        "setRefId",
        "docType",
        "placeholder",
        "isActive",
    ]);

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

    createEffect(() => setEditMode(props.isActive ?? false));

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
                    isActive={true}
                    refId={props.refId}
                    setRefId={(refId) => {
                        props.setRefId(refId);
                        disableEditMode();
                    }}
                    onCancel={disableEditMode}
                    docType={props.docType}
                    {...inputOptions}
                />
            </Show>
        </div>
    );
}

/** Input a document ref ID.

The UUID can be entered directly or parsed from a URL, the latter being more
convenient for copy-paste.
 */
function RefInput(
    allProps: TextInputOptions & {
        refId: Uuid | null;
        setRefId: (refId: Uuid | null) => void;
        onCancel?: () => void;
        docType?: Document["type"];
    },
) {
    const [props, inputOptions] = splitProps(allProps, [
        "refId",
        "setRefId",
        "onCancel",
        "docType",
    ]);

    const [inputText, setInputText] = createSignal("");
    const [errorText, setErrorText] = createSignal("");

    createEffect(() => setInputText(props.refId ?? ""));

    const onSubmit = (text: string) => {
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
                onSubmit(inputText());
            }}
        >
            <TextInput
                text={inputText()}
                setText={setInputText}
                placeholder="Enter URL"
                interceptKeyDown={(evt) => {
                    if (evt.key === "Enter") {
                        onSubmit(inputText());
                    } else if (evt.key === "Escape" && props.onCancel) {
                        props.onCancel();
                    } else {
                        return false;
                    }
                    return true;
                }}
                {...inputOptions}
            />
            <FieldError error={errorText()} />
        </form>
    );
}
