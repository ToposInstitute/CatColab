import { useNavigate } from "@solidjs/router";
import { getAuth, signOut } from "firebase/auth";
import { useAuth, useFirebaseApp } from "solid-firebase";
import {
    type ComponentProps,
    For,
    Match,
    Show,
    Switch,
    createEffect,
    createResource,
    createSignal,
} from "solid-js";
import { createStore, produce } from "solid-js/store";
import invariant from "tiny-invariant";

import type { NewPermissions, PermissionLevel, Permissions, UserSummary } from "catcolab-api";
import { Dialog, FormGroup, IconButton, SelectField, Warning } from "catcolab-ui-components";
import type { Document } from "catlog-wasm";
import { type LiveDoc, useApi } from "../api";
import { deepCopyJSON } from "../util/deepcopy";
import { Login } from "./login";
import { NameUser, UserInput } from "./username";

import Copy from "lucide-solid/icons/copy";
import FileLock from "lucide-solid/icons/file-lock-2";
import FilePen from "lucide-solid/icons/file-pen";
import FileUser from "lucide-solid/icons/file-user";
import Globe from "lucide-solid/icons/globe";
import Link2 from "lucide-solid/icons/link-2";

import "./permissions.css";

type PermissionsState = Partial<Omit<Permissions, "users">> & {
    users?: Array<{
        user: UserSummary;
        level: PermissionLevel | null;
    }> | null;
};

/** Form to configure permissions on a document.
 */
export function PermissionsForm(props: {
    refId?: string;
    onComplete?: () => void;
}) {
    const [state, setState] = createStore<PermissionsState>({});

    const pendingPermissions = (): NewPermissions => {
        const entries = state.users
            ?.filter((userPerm) => userPerm.level != null)
            .map((userPerm) => [userPerm.user.id, userPerm.level]);
        return {
            anyone: state.anyone ?? null,
            users: entries ? Object.fromEntries(entries) : null,
        };
    };

    const api = useApi();

    const [currentPermissions] = createResource(
        () => props.refId,
        async (refId) => {
            const result = await api.rpc.get_permissions.query(refId);
            invariant(result.tag === "Ok");
            return result.content;
        },
    );

    createEffect(() => {
        const permissions = currentPermissions();
        if (permissions) {
            setState(deepCopyJSON(permissions));
        }
    });

    const addEntry = (user: UserSummary) => {
        if (!state.users || state.users.some((perm) => perm.user.id === user.id)) {
            return;
        }
        setState(produce((state) => state.users?.push({ user, level: "Read" })));
    };

    const willAddOwners = (): boolean =>
        state.users?.some(
            (perm, i) => perm.level === "Own" && currentPermissions()?.users?.[i]?.level !== "Own",
        ) ?? false;

    const updatePermissions = async () => {
        invariant(props.refId);
        invariant(!currentPermissions.loading && !currentPermissions.error);
        const result = await api.rpc.set_permissions.mutate(props.refId, pendingPermissions());
        invariant(result.tag === "Ok");
    };

    const submitPermissions = async () => {
        await updatePermissions();
        props.onComplete?.();
    };

    const copyToClipboard = async () => {
        if (navigator.clipboard) {
            await navigator.clipboard.writeText(window.location.href);
        } else {
            throw new Error("Link to document could not be copied.");
        }
    };

    // Bypass standard form submission so that pressing Enter does not submit.
    return (
        <form class="permissions" onSubmit={(evt) => evt.preventDefault()}>
            <FormGroup>
                <SelectField
                    label="General access"
                    value={state.anyone ?? ""}
                    onInput={(evt) => {
                        const value = evt.currentTarget.value;
                        setState({ anyone: value ? (value as PermissionLevel) : null });
                    }}
                >
                    <option value="">Only authorized people can access</option>
                    <option value="Read">Anyone can view</option>
                    <option value="Write">Anyone can edit</option>
                </SelectField>
                <Show
                    when={state.anyone === "Write" && state.anyone !== currentPermissions()?.anyone}
                >
                    <Warning>
                        <p>{"Anyone with the link will be able to edit the document."}</p>
                        <p>{"This setting is convenient but it is not secure."}</p>
                    </Warning>
                </Show>
            </FormGroup>
            <FormGroup>
                <dt>People with access</dt>
                <dd class="permission-entries">
                    <For each={state.users ?? []}>
                        {(userPerm, i) => (
                            <div class="permission-entry">
                                <label for={`entry-${i()}`}>
                                    <NameUser {...userPerm.user} />
                                </label>
                                <select
                                    id={`entry-${i()}`}
                                    value={userPerm.level ?? ""}
                                    disabled={currentPermissions()?.users?.[i()]?.level === "Own"}
                                    onInput={(evt) => {
                                        const value = evt.currentTarget.value;
                                        setState(
                                            produce((state) => {
                                                const user = state.users?.[i()];
                                                invariant(user);
                                                user.level = value
                                                    ? (value as PermissionLevel)
                                                    : null;
                                            }),
                                        );
                                    }}
                                >
                                    <option value="">Remove access</option>
                                    <option value="Read">View</option>
                                    <option value="Write">Edit</option>
                                    <option value="Own">Own</option>
                                </select>
                            </div>
                        )}
                    </For>
                    <UserInput
                        setUser={addEntry}
                        placeholder="Add a person by entering their username"
                    />
                </dd>
            </FormGroup>
            <Show when={willAddOwners()}>
                <Warning>
                    <p>{"Setting these permissions will be an irrevocable action."}</p>
                    <p>{"Ownership, once granted, cannot be revoked."}</p>
                </Warning>
            </Show>
            <div class="permissions-button-container">
                <button type="button" class="button utility" onClick={copyToClipboard}>
                    <Link2 />
                    Copy link
                </button>
                <div class="permissions-spacer" />
                <button
                    type="button"
                    class="ok"
                    disabled={
                        !props.refId || currentPermissions.loading || currentPermissions.error
                    }
                    onClick={submitPermissions}
                >
                    Update permissions
                </button>
            </div>
        </form>
    );
}

/** Toolbar button summarizing the document's permissions. */
export const PermissionsButton = (props: {
    liveDoc: LiveDoc;
}) => (
    <Show when={props.liveDoc.docRef}>
        {(docRef) => {
            const anyone = () => docRef().permissions.anyone;
            const user = () => docRef().permissions.user;
            return (
                <Switch fallback={<EditorPermissionsButton permissions={docRef().permissions} />}>
                    <Match when={anyone() === "Own"}>
                        <AnonPermissionsButton />
                    </Match>
                    <Match when={user() === "Own"}>
                        <OwnerPermissionsButton refId={docRef().refId} />
                    </Match>
                    <Match
                        when={[anyone(), user()].every(
                            (level) => level === null || level === "Read",
                        )}
                    >
                        <ReadonlyPermissionsButton doc={props.liveDoc.doc} />
                    </Match>
                </Switch>
            );
        }}
    </Show>
);

function AnonPermissionsButton() {
    const firebaseApp = useFirebaseApp();
    const user = useAuth(getAuth(firebaseApp));

    const [open, setOpen] = createSignal(false);

    const logOut = async () => {
        await signOut(getAuth(firebaseApp));
        setOpen(false);
    };
    return (
        <Dialog
            open={open()}
            onOpenChange={setOpen}
            title="Permissions"
            trigger={AnonPermissionsTrigger}
        >
            <p>
                This document can be <strong>edited by anyone</strong> with the link.
            </p>
            <Switch>
                <Match when={user.data}>
                    <p>
                        Create a new document to restrict permissions, <br /> or{" "}
                        <a href="#" onClick={logOut}>
                            log out
                        </a>{" "}
                        to create other anonymous documents.
                    </p>
                </Match>
                <Match when={!user.loading}>
                    <div class="separator" />
                    <p>To create documents with restricted permissions, log in.</p>
                    <Login onComplete={() => setOpen(false)} />
                </Match>
            </Switch>
        </Dialog>
    );
}

const AnonPermissionsTrigger = (props: ComponentProps<"button">) => {
    const tooltip = (
        <>
            This document is <strong>editable by anyone</strong> with the link
        </>
    );
    return (
        <IconButton {...props} tooltip={tooltip}>
            <Globe />
        </IconButton>
    );
};

const ReadonlyPermissionsButton = (props: {
    doc: Document;
}) => {
    const [open, setOpen] = createSignal(false);
    const api = useApi();
    const navigate = useNavigate();

    const onDuplicateDocument = async () => {
        const newRef = await api.duplicateDoc(props.doc);
        navigate(`/${props.doc.type}/${newRef}`);
    };

    return (
        <Dialog
            open={open()}
            onOpenChange={setOpen}
            title="Read-only document"
            trigger={ReadonlyPermissionsTrigger}
        >
            <p>
                This document is <strong>read-only</strong>. Any changes that you make will be
                temporary.
            </p>
            <div class="separator" />
            <form class="permissions" onSubmit={(evt) => evt.preventDefault()}>
                <div class="duplicate-button-container">
                    <span>
                        <button type="button" class="button utility" onClick={onDuplicateDocument}>
                            <Copy />
                            Duplicate {props.doc.type}
                        </button>
                    </span>
                    <span class="duplicate-button-height-text"> to make permanent changes.</span>
                </div>
            </form>
        </Dialog>
    );
};

const ReadonlyPermissionsTrigger = (props: ComponentProps<"button">) => {
    const tooltip = (
        <>
            This document is <strong>read-only</strong>. Click to see more info.
        </>
    );
    return (
        <IconButton {...props} tooltip={tooltip}>
            <FileLock />
        </IconButton>
    );
};

const EditorPermissionsButton = (props: {
    permissions: Permissions;
}) => {
    const tooltip = (permissions: Permissions) => (
        <>
            {"This document "}
            <Show when={permissions.user}>
                is <strong>{permissionAdjective(permissions.user)}</strong> by you {"and "}
            </Show>
            is <strong>{permissionAdjective(permissions.anyone)}</strong> by the public
        </>
    );
    return (
        <IconButton tooltip={tooltip(props.permissions)}>
            <FilePen />
        </IconButton>
    );
};

function OwnerPermissionsButton(props: {
    refId?: string;
}) {
    const [open, setOpen] = createSignal(false);

    return (
        <Dialog
            open={open()}
            onOpenChange={setOpen}
            title="Permissions"
            trigger={OwnerPermissionsTrigger}
        >
            <PermissionsForm refId={props.refId} onComplete={() => setOpen(false)} />
        </Dialog>
    );
}

const OwnerPermissionsTrigger = (props: ComponentProps<"button">) => {
    const tooltip = (
        <>
            <p>
                You <strong>own</strong> this document.
            </p>
            <p>Click to change who has access.</p>
        </>
    );
    return (
        <IconButton {...props} tooltip={tooltip}>
            <FileUser />
        </IconButton>
    );
};

const permissionAdjective = (level: PermissionLevel | null) =>
    level ? permissionAdjectives[level] : "not viewable";

const permissionAdjectives: { [level in PermissionLevel]: string } = {
    Read: "viewable",
    Write: "editable",
    Maintain: "maintained",
    Own: "owned",
};
