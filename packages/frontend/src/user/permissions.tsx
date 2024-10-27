import { getAuth, signOut } from "firebase/auth";
import { useAuth, useFirebaseApp } from "solid-firebase";
import { type ComponentProps, Match, Switch, createSignal } from "solid-js";

import { Dialog, IconButton } from "../components";
import { Login } from "./login";

import Globe from "lucide-solid/icons/globe";

export function AnonDocButton() {
    const firebaseApp = useFirebaseApp();
    const user = useAuth(getAuth(firebaseApp));

    const [open, setOpen] = createSignal(false);

    const logOut = async () => {
        await signOut(getAuth(firebaseApp));
        setOpen(false);
    };

    return (
        <Dialog open={open()} onOpenChange={setOpen} title="Permissions" trigger={AnonDocTrigger}>
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
                    <p>To create restricted documents, you must login.</p>
                    <Login onComplete={() => setOpen(false)} />
                </Match>
            </Switch>
        </Dialog>
    );
}

const AnonDocTrigger = (props: ComponentProps<"button">) => {
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
