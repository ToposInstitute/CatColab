import { DropdownMenu } from "@kobalte/core/dropdown-menu";
import { useNavigate } from "@solidjs/router";
import { getAuth, signOut } from "firebase/auth";
import { useAuth, useFirebaseApp } from "solid-firebase";
import { type JSX, Show, useContext } from "solid-js";
import invariant from "tiny-invariant";

import { useApi } from "../api";
import { IconButton } from "../components";
import { createModel } from "../model/document";
import { TheoryLibraryContext } from "../stdlib";
import { PageActionsContext } from "./context";

import FilePlus from "lucide-solid/icons/file-plus";
import Info from "lucide-solid/icons/info";
import LogInIcon from "lucide-solid/icons/log-in";
import LogOutIcon from "lucide-solid/icons/log-out";
import MenuIcon from "lucide-solid/icons/menu";
import SettingsIcon from "lucide-solid/icons/settings";
import TableOfContentsIcon from "lucide-solid/icons/table-of-contents";
import UploadIcon from "lucide-solid/icons/upload";

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

    // Root the dialog here so that it is not destroyed when the menu closes.
    return (
        <>
            <HamburgerMenu disabled={props.disabled}>
                {props.children}
                <Show when={props.children}>
                    <MenuSeparator />
                </Show>

                <HelpMenuItem />

                <Show when={auth.data} fallback={<LogInMenuItem />}>
                    <DocumentsMenuItem />
                    <SettingsMenuItem />
                    <LogOutMenuItem />
                </Show>
            </HamburgerMenu>
        </>
    );
}

/** Default application menu for pages without more specific actions. */
export const DefaultAppMenu = () => (
    <AppMenu>
        <NewModelItem />
        <ImportMenuItem />
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

/** Menu item to import a document. */
export function ImportMenuItem() {
    const actions = useContext(PageActionsContext);
    invariant(actions, "Page actions should be provided");

    return (
        <MenuItem onSelect={actions.showImportDialog}>
            <UploadIcon />
            <MenuItemLabel>{"Import notebook"}</MenuItemLabel>
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

function LogInMenuItem() {
    const actions = useContext(PageActionsContext);
    invariant(actions, "Page actions should be provided");

    return (
        <MenuItem onSelect={actions.showLoginDialog}>
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

function DocumentsMenuItem() {
    const navigate = useNavigate();

    return (
        <MenuItem onSelect={() => navigate("/documents")}>
            <TableOfContentsIcon />
            <MenuItemLabel>{"My documents"}</MenuItemLabel>
        </MenuItem>
    );
}
