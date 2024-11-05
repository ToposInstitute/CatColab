import { destructure } from "@solid-primitives/destructure";
import { getAuth, signOut } from "firebase/auth";
import { useAuth, useFirebaseApp } from "solid-firebase";
import { type ComponentProps, Match, Switch, createSignal } from "solid-js";

import type { Permissions } from "catcolab-api";
import { Dialog, IconButton } from "../components";
import { Login } from "./login";

import Globe from "lucide-solid/icons/globe";
import User from "lucide-solid/icons/user";

/** Toolbar button summarizing the document's permissions.
 */
export function PermissionsButton(props: {
    permissions: Permissions;
}) {
    const {
        permissions: { anyone, user },
    } = destructure(props, { deep: true });

    return (
        <Switch>
            <Match when={anyone?.() === "Own"}>
                <AnonPermissionsButton />
            </Match>
            <Match when={user?.() === "Own" && anyone?.() === null}>
                <PrivatePermissionsButton />
            </Match>
        </Switch>
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

const PrivatePermissionsButton = (props: ComponentProps<"button">) => {
    const tooltip = "This document is owned by you and viewable only by you";
    return (
        <IconButton {...props} tooltip={tooltip}>
            <User />
        </IconButton>
    );
};
