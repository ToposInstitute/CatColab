import { getAuth, signOut } from "firebase/auth";
import { useAuth, useFirebaseApp } from "solid-firebase";
import { type ComponentProps, Match, Show, Switch, createSignal } from "solid-js";

import type { PermissionLevel, Permissions } from "catcolab-api";
import { Dialog, IconButton } from "../components";
import { Login } from "./login";

import Globe from "lucide-solid/icons/globe";
import Lock from "lucide-solid/icons/lock";
import User from "lucide-solid/icons/user";
import Users from "lucide-solid/icons/users";

/** Toolbar button summarizing the document's permissions.
 */
export function PermissionsButton(props: {
    permissions: Permissions;
}) {
    const anyone = () => props.permissions.anyone;
    const user = () => props.permissions.user;

    return (
        <Switch fallback={<SharedPermissionsButton permissions={props.permissions} />}>
            <Match when={anyone() === "Own"}>
                <AnonPermissionsButton />
            </Match>
            <Match when={!user() || user() === "Read"}>
                <ReadonlyPermissionsButton />
            </Match>
            <Match when={!anyone()}>
                <PrivatePermissionsButton permissions={props.permissions} />
            </Match>
        </Switch>
    );
}

/** Toolbar button for the document's permission, if available.

Suitable for use while the document is being loaded.
 */
export function MaybePermissionsButton(props: {
    permissions?: Permissions;
}) {
    const fallback = () => (
        <IconButton disabled>
            <Lock />
        </IconButton>
    );
    return (
        <Show when={props.permissions} fallback={fallback()}>
            {(permissions) => <PermissionsButton permissions={permissions()} />}
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
                    <p>To create documents that you own, log in.</p>
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
            <Lock />
        </IconButton>
    );
};

const SharedPermissionsButton = (props: {
    permissions: Permissions;
}) => {
    const tooltip = (permissions: Permissions) => (
        <>
            This document is <strong>{permissionAdjective(permissions.user)}</strong> by you and{" "}
            {permissionAdjective(permissions.anyone)} by anyone.
        </>
    );
    return (
        <IconButton tooltip={tooltip(props.permissions)}>
            <Users />
        </IconButton>
    );
};

const PrivatePermissionsButton = (props: {
    permissions: Permissions;
}) => {
    const tooltip = (permissions: Permissions) => (
        <>
            This document is <strong>{permissionAdjective(permissions.user)}</strong> by you and is
            not publicly viewable.
        </>
    );
    return (
        <IconButton tooltip={tooltip(props.permissions)}>
            <User />
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
