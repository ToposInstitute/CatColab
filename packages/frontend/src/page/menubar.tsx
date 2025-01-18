import { DropdownMenu } from "@kobalte/core/dropdown-menu";
import { useNavigate } from "@solidjs/router";
import { getAuth, signOut } from "firebase/auth";
import { useAuth, useFirebaseApp } from "solid-firebase";
import { type JSX, Show, createSignal, useContext } from "solid-js";
import invariant from "tiny-invariant";

import { useApi } from "../api";
import { createModel } from "../model/document";
import { TheoryLibraryContext } from "../stdlib";
import { Dialog, IconButton } from "../components";

import { Login } from "../user";
import { Import } from "./import";

import {
    FilePlus,
    LogInIcon,
    LogOutIcon,
    MenuIcon,
    SettingsIcon,
    UploadIcon,
} from "lucide-solid";

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
    children?: JSX.Element;
    disabled?: boolean;
}) {
    const firebaseApp = useFirebaseApp();
    const auth = useAuth(getAuth(firebaseApp));

    const [loginOpen, setLoginOpen] = createSignal(false);
    const [openImport, setImportOpen] = createSignal(false);

    // Root the dialog here so that it is not destroyed when the menu closes.
    return (
        <>
            <HamburgerMenu>
                {props.children}
                <Show when={props.children}>
                    <MenuSeparator />
                </Show>
                <HelpMenuItem />

                <Show
                    when={auth.data}
                    fallback={<LogInMenuItem showLogin={() => setLoginOpen(true)} />}
                >
                    <SettingsMenuItem />
                    <LogOutMenuItem />
                </Show>
                <ImportMenuItem showImport={() => setImportOpen(true)} />
            </HamburgerMenu>
            <Dialog open={loginOpen()} onOpenChange={setLoginOpen} title="Log in">
                <Login onComplete={() => setLoginOpen(false)} />
            </Dialog>
            <Dialog open={openImport()} onOpenChange={setImportOpen} title="Import">
                <Import onComplete={() => setImportOpen(false)} />
            </Dialog>
        </>
    );
}

/** Default application menu for pages without more specific actions. */
export const DefaultAppMenu = () => (
    <AppMenu>
        <NewModelItem />
    </AppMenu>
);

/** Menu item to create a new model. */
export function NewModelItem() {
    const api = useApi();
    const navigate = useNavigate();

    const theories = useContext(TheoryLibraryContext);
    invariant(theories, "Theory library must be provided as context");

    const onNewModel = async () => {
        const newRef = await createModel(api, theories.getDefault().id);
        navigate(`/model/${newRef}`);
    };

    return (
        <MenuItem onSelect={onNewModel}>
            <FilePlus />
            <MenuItemLabel>{"New model"}</MenuItemLabel>
        </MenuItem>
    );
}

/** Menu item navigating to the top-level application help. */
function HelpMenuItem() {
    const navigate = useNavigate();

    return (
        <MenuItem onSelect={() => navigate("/help")}>
            <Info />
            <MenuItemLabel>Info & documentation</MenuItemLabel>
        </MenuItem>
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

function SettingsMenuItem() {
    const navigate = useNavigate();

    return (
        <MenuItem onSelect={() => navigate("/profile")}>
            <SettingsIcon />
            <MenuItemLabel>{"Edit user profile"}</MenuItemLabel>
        </MenuItem>
    );
}

function ImportMenuItem(props: {
    showImport: () => void;
}) {
    return (
        <MenuItem onSelect={props.showImport}>
            <UploadIcon />
            <MenuItemLabel>{"Import notebook"}</MenuItemLabel>
        </MenuItem>
    );
}
