import { DropdownMenu } from "@kobalte/core/dropdown-menu";
import { useNavigate } from "@solidjs/router";
import { getAuth, signOut } from "firebase/auth";
import { useAuth, useFirebaseApp } from "solid-firebase";
import { type JSX, Show, createSignal } from "solid-js";

import { Dialog, IconButton } from "../components";
import { Login } from "../user";

import CircleHelp from "lucide-solid/icons/circle-help";
import LogInIcon from "lucide-solid/icons/log-in";
import LogOutIcon from "lucide-solid/icons/log-out";
import MenuIcon from "lucide-solid/icons/menu";

import "./menubar.css";

/** Menu triggered from a hamburger button. */
export function HamburgerMenu(props: {
    children: JSX.Element;
    disabled?: boolean;
}) {
    // XXX: Dropdown menu should be modal but we make it non-modal to work
    // around bug that pointer events are not restored after a dialog is
    // spawned. Similar issues have been reported and supposedly fixed upstream
    // but I'm still seeing the problem as of Kobalte 0.13.7.
    return (
        <DropdownMenu modal={false}>
            <DropdownMenu.Trigger as={IconButton} disabled={props.disabled}>
                <MenuIcon />
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
                <DropdownMenu.Content class="menu popup">{props.children}</DropdownMenu.Content>
            </DropdownMenu.Portal>
        </DropdownMenu>
    );
}

export const MenuItem = DropdownMenu.Item;
export const MenuItemLabel = DropdownMenu.ItemLabel;
export const MenuSeparator = DropdownMenu.Separator;

/** Top-level menu for application.

Contains menu items common to all pages, plus space for page-specific items.
 */
export function AppMenu(props: {
    children: JSX.Element;
    disabled?: boolean;
}) {
    const [loginOpen, setLoginOpen] = createSignal(false);

    // Root the dialog here so that it is not destroyed when the menu closes.
    return (
        <>
            <HamburgerMenu>
                {props.children}
                <MenuSeparator />
                <HelpMenuItem />
                <LogInOrOutMenuItem showLogin={() => setLoginOpen(true)} />
            </HamburgerMenu>
            <Dialog open={loginOpen()} onOpenChange={setLoginOpen} title="Log in">
                <Login onComplete={() => setLoginOpen(false)} />
            </Dialog>
        </>
    );
}

/** Menu item navigating to the top-level application help. */
function HelpMenuItem() {
    const navigate = useNavigate();

    return (
        <MenuItem onSelect={() => navigate("/help")}>
            <CircleHelp />
            <MenuItemLabel>Help</MenuItemLabel>
        </MenuItem>
    );
}

/** Menu item to log in or out, depending on auth state. */
function LogInOrOutMenuItem(props: {
    showLogin: () => void;
}) {
    const firebaseApp = useFirebaseApp();
    const state = useAuth(getAuth(firebaseApp));

    return (
        <Show when={!state.data} fallback={<LogOutMenuItem />}>
            <LogInMenuItem showLogin={props.showLogin} />
        </Show>
    );
}

function LogInMenuItem(props: {
    showLogin: () => void;
}) {
    return (
        <MenuItem onSelect={props.showLogin}>
            <LogInIcon />
            <MenuItemLabel>{"Log in or sign up"}</MenuItemLabel>
        </MenuItem>
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
