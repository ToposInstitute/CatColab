import { useNavigate } from "@solidjs/router";
import { getAuth, signOut } from "firebase/auth";
import { useAuth, useFirebaseApp } from "solid-firebase";
import { Show, createSignal } from "solid-js";

import { Dialog } from "../components";
import { Login } from "../user";
import { MenuItem, MenuItemLabel } from "./menubar";

import CircleHelp from "lucide-solid/icons/circle-help";
import LogInIcon from "lucide-solid/icons/log-in";
import LogOutIcon from "lucide-solid/icons/log-out";

/** Menu items common to any page. */
export const CommonMenuItems = () => (
    <>
        <HelpMenuItem />
        <LogInOrOutMenuItem />
    </>
);

/** Menu item navigating to the top-level application help. */
export function HelpMenuItem() {
    const navigate = useNavigate();

    return (
        <MenuItem onSelect={() => navigate("/help")}>
            <CircleHelp />
            <MenuItemLabel>Help</MenuItemLabel>
        </MenuItem>
    );
}

/** Menu item to log in or out, depending on auth state. */
export function LogInOrOutMenuItem() {
    const firebaseApp = useFirebaseApp();
    const state = useAuth(getAuth(firebaseApp));

    return (
        <Show when={!state.data} fallback={<LogOutMenuItem />}>
            <LogInMenuItem />
        </Show>
    );
}

function LogInMenuItem() {
    const [open, setOpen] = createSignal(false);

    const Trigger = () => (
        <MenuItem onSelect={() => setOpen(true)}>
            <LogInIcon />
            <MenuItemLabel>{"Log in"}</MenuItemLabel>
        </MenuItem>
    );

    return (
        <Dialog open={open()} onOpenChange={setOpen} title="Log in" trigger={Trigger}>
            <Login onComplete={() => setOpen(false)} />
        </Dialog>
    );
}

function LogOutMenuItem() {
    const firebaseApp = useFirebaseApp();

    return (
        <MenuItem onSelect={() => signOut(getAuth(firebaseApp))}>
            <LogOutIcon />
            <MenuItemLabel>{"Log out"}</MenuItemLabel>
        </MenuItem>
    );
}
