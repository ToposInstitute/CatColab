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
import { useApi } from "../api";
import { Dialog, FormGroup, IconButton, SelectItem, Warning } from "../components";
import { EmbedButton } from "../model/model_editor";
import { deepCopyJSON } from "../util/deepcopy";
import { Login } from "./login";
import { NameUser, UserInput } from "./username";

import File from "lucide-solid/icons/file";
import FileLock from "lucide-solid/icons/file-lock-2";
import FilePen from "lucide-solid/icons/file-pen";
import FileUser from "lucide-solid/icons/file-user";
import Globe from "lucide-solid/icons/globe";

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

    // Bypass standard form submission so that pressing Enter does not submit.
    return (
        <form class="permissions" onSubmit={(evt) => evt.preventDefault()}>
            <FormGroup>
                <SelectItem
                    id="entry-anyone"
                    label="Any person can"
                    value={state.anyone ?? ""}
                    onInput={(evt) => {
                        const value = evt.currentTarget.value;
                        setState({ anyone: value ? (value as PermissionLevel) : null });
                    }}
                >
                    <option value="">Not access the document</option>
                    <option value="Read">View</option>
                    <option value="Write">Edit</option>
                </SelectItem>
                <Show
                    when={state.anyone === "Write" && state.anyone !== currentPermissions()?.anyone}
                >
                    <Warning>
                        <p>{"Any person with the link will be able to edit the document."}</p>
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
            <button
                type="button"
                class="ok"
                disabled={!props.refId || currentPermissions.loading || currentPermissions.error}
                onClick={submitPermissions}
            >
                Update permissions
            </button>
        </form>
    );
}

/** Toolbar button summarizing the document's permissions.
 */
export function PermissionsButton(props: {
    permissions: Permissions;
    refId?: string;
}) {
    const anyone = () => props.permissions.anyone;
    const user = () => props.permissions.user;

    return (
        <Switch fallback={<EditorPermissionsButton permissions={props.permissions} />}>
            <Match when={anyone() === "Own"}>
                <AnonPermissionsButton />
            </Match>
            <Match when={user() === "Own"}>
                <OwnerPermissionsButton refId={props.refId} />
            </Match>
            <Match when={[anyone(), user()].every((level) => level === null || level === "Read")}>
                <ReadonlyPermissionsButton />
            </Match>
        </Switch>
    );
}

/** Toolbar button summarizing the document's permissions, if available.

Suitable for use while the document is being loaded.
 */
export function MaybePermissionsButton(props: {
    permissions?: Permissions;
    refId?: string;
}) {
    const fallback = () => (
        <IconButton disabled>
            <File />
        </IconButton>
    );
    return (
        <Show when={props.permissions} fallback={fallback()}>
            {(permissions) => <PermissionsButton permissions={permissions()} refId={props.refId} />}
        </Show>
    );
}

function AnonPermissionsButton() {
    const firebaseApp = useFirebaseApp();
    const user = useAuth(getAuth(firebaseApp));

    const [open, setOpen] = createSignal(false);

    const logOut = async () => {
        await signOut(getAuth(firebaseApp));
        setOpen(false);
    };

    return (
        <>
            <Dialog open={open()} onOpenChange={setOpen} title="" trigger={AnonPermissionsTrigger}>
                <div class="embed-button">
                    <h4>Permissions</h4>
                    <EmbedButton />
                </div>

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
        </>
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

const ReadonlyPermissionsButton = () => {
    const tooltip = (
        <>
            <p>
                This document is <strong>read-only</strong>.
            </p>
            <p>Any changes that you make will be temporary.</p>
        </>
    );
    return (
        <IconButton tooltip={tooltip}>
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
