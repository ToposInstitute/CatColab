import Tooltip from "@corvu/tooltip";
import { A } from "@solidjs/router";
import type { DocInfo } from "catcolab-api/src/user_state";
import Copy from "lucide-solid/icons/copy";
import Pencil from "lucide-solid/icons/pencil";
import {
    type ComponentProps,
    createEffect,
    createMemo,
    createResource,
    createSignal,
    Match,
    Show,
    Switch,
    splitProps,
    useContext,
} from "solid-js";
import * as uuid from "uuid";

import {
    type Completion,
    DocumentTypeIcon,
    FieldError,
    IconButton,
    RelativeTime,
    TextInput,
    type TextInputOptions,
} from "catcolab-ui-components";
import type { Document, Uuid } from "catlog-wasm";
import { useApi } from "../api";
import { TheoryLibraryContext } from "../theory";
import { useUserState } from "../user/user_state_context";

import "./document_picker.css";

/** Dual-mode component to display and pick a document.

Supports two selection methods:
- **Search by name**: type to filter completions from the user's documents.
- **URL/UUID paste**: paste a document URL or UUID directly and press Enter.
 */
export function DocumentPicker(
    allProps: TextInputOptions & {
        refId: Uuid | null;
        setRefId: (refId: Uuid | null) => void;
        docType?: Document["type"];
        placeholder?: string;
        /** Predicate to filter which documents appear as completions. */
        filterCompletions?: (refId: string, doc: DocInfo) => boolean;
    },
) {
    const [props, inputOptions] = splitProps(allProps, [
        "refId",
        "setRefId",
        "docType",
        "placeholder",
        "isActive",
        "filterCompletions",
    ]);

    const api = useApi();

    // TODO: API should cache mapping from ref ID to Automerge doc URL to avoid
    // hitting the backend too frequently.
    const [liveDocWithRef] = createResource(
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
            <Match when={liveDocWithRef()}>
                {(liveDocWithRef) => (
                    <A
                        href={`/${liveDocWithRef().liveDoc.doc.type}/${liveDocWithRef().docRef.refId}`}
                        {...linkProps}
                    >
                        {liveDocWithRef().liveDoc.doc.name || "Untitled"}
                    </A>
                )}
            </Match>
        </Switch>
    );

    const copyToClipboard = async () => {
        if (props.refId) {
            await navigator.clipboard.writeText(props.refId);
        }
    };

    const EditableDocLink = () => (
        <Tooltip placement="bottom">
            <Tooltip.Anchor>
                <Tooltip.Trigger as={DocLink} />
            </Tooltip.Anchor>
            <Tooltip.Portal>
                <Tooltip.Content class="popup document-picker-popup">
                    <IconButton onClick={copyToClipboard}>
                        <Copy />
                    </IconButton>
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
                <DocSearchInput
                    isActive={true}
                    refId={props.refId}
                    setRefId={(refId) => {
                        props.setRefId(refId);
                        disableEditMode();
                    }}
                    onCancel={disableEditMode}
                    docType={props.docType}
                    filterCompletions={props.filterCompletions}
                    {...inputOptions}
                />
            </Show>
        </div>
    );
}

/** Input for selecting a document by searching or pasting a URL.

Shows completions from the user's documents (optionally filtered by a
predicate). Also accepts a pasted URL or UUID, parsed on Enter.
 */
function DocSearchInput(
    allProps: TextInputOptions & {
        refId: Uuid | null;
        setRefId: (refId: Uuid | null) => void;
        onCancel?: () => void;
        docType?: Document["type"];
        filterCompletions?: (refId: string, doc: DocInfo) => boolean;
    },
) {
    const [props, inputOptions] = splitProps(allProps, [
        "refId",
        "setRefId",
        "onCancel",
        "docType",
        "filterCompletions",
    ]);

    const userState = useUserState();
    const theories = useContext(TheoryLibraryContext);

    const [inputText, setInputText] = createSignal("");
    const [errorText, setErrorText] = createSignal("");

    const iconLettersForTheory = (theoryId: string | null): [string, string] | undefined => {
        if (!theoryId || !theories) {
            return undefined;
        }
        try {
            return theories.getMetadata(theoryId).iconLetters;
        } catch (_e) {
            return undefined;
        }
    };

    // Build completions from the user's document list, filtered by the
    // caller-provided predicate (if any) and excluding deleted documents.
    const documentCompletions = createMemo((): Completion[] => {
        const docs = userState.documents;
        const filter = props.filterCompletions;

        const entries = Object.entries(docs) as [string, DocInfo][];
        return entries
            .filter(([refId, doc]) => {
                if (doc.deletedAt !== null) {
                    return false;
                }
                if (filter && !filter(refId, doc)) {
                    return false;
                }
                return true;
            })
            .toSorted(([, a], [, b]) => b.currentSnapshotUpdatedAt - a.currentSnapshotUpdatedAt)
            .map(([refId, doc]) => ({
                name: doc.name || "Untitled",
                nameClass: doc.name ? undefined : "untitled-doc",
                description: (
                    <>
                        Last edited: <RelativeTime timestamp={doc.currentSnapshotUpdatedAt} />
                    </>
                ),
                icon: (
                    <DocumentTypeIcon
                        documentType="model"
                        letters={iconLettersForTheory(doc.theory)}
                    />
                ),
                onComplete: () => {
                    setErrorText("");
                    props.setRefId(refId);
                },
            }));
    });

    /** Try to parse a ref ID from text that may be a URL or raw UUID. */
    const tryParseRefId = (text: string): string | null => {
        text = text.trim();
        if (text === "") {
            return null;
        }
        if (URL.canParse(text)) {
            const url = new URL(text);
            text = url.pathname.split("/").pop() ?? "";
        }
        return uuid.validate(text) ? text : null;
    };

    const onSubmit = (text: string) => {
        text = text.trim();
        if (text === "") {
            props.setRefId(null);
            return;
        }

        const refId = tryParseRefId(text);
        if (refId) {
            setErrorText("");
            props.setRefId(refId);
        } else {
            setErrorText(`The ${props.docType ?? "document"} identifier is not valid`);
        }
    };

    return (
        <div class="document-picker-search">
            <TextInput
                text={inputText()}
                setText={(text) => {
                    setInputText(text);
                    setErrorText("");
                }}
                placeholder="Search or paste URL"
                completions={documentCompletions()}
                showCompletionsOnFocus={true}
                popupClass="document-picker-completions"
                completionsEmptyText="No results"
                interceptKeyDown={(evt) => {
                    if (evt.key === "Escape" && props.onCancel) {
                        props.onCancel();
                        return true;
                    }
                    return false;
                }}
                createBelow={() => onSubmit(inputText())}
                {...inputOptions}
            />
            <FieldError error={errorText()} />
        </div>
    );
}
