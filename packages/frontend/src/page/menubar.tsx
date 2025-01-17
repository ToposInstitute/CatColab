import { DropdownMenu } from "@kobalte/core/dropdown-menu";
import { useNavigate } from "@solidjs/router";
import { getAuth, signOut } from "firebase/auth";
import { useAuth, useFirebaseApp } from "solid-firebase";
import { type JSX, Show, createSignal, useContext } from "solid-js";
import invariant from "tiny-invariant";

import { type ModelDocument } from "../model";
import { type DiagramDocument } from "../diagram";
import type { AnalysisDocument } from "../analysis";

import { useApi } from "../api";
import { Dialog, IconButton } from "../components";
import { createModel } from "../model/document";
import { TheoryLibraryContext } from "../stdlib";
import { createDiagram } from "../diagram";

import { Login } from "../user";

import FilePlus from "lucide-solid/icons/file-plus";
import Info from "lucide-solid/icons/info";
import LogInIcon from "lucide-solid/icons/log-in";
import LogOutIcon from "lucide-solid/icons/log-out";
import MenuIcon from "lucide-solid/icons/menu";
import SettingsIcon from "lucide-solid/icons/settings";

import { JsonImport } from "../components/json_import";
import "./menubar.css";

type Document = ModelDocument | DiagramDocument | AnalysisDocument;
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
    const [openOpen, setOpenOpen] = createSignal(false);

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
                <OpenMenuItem showOpen={() => setOpenOpen(true)} />
            </HamburgerMenu>
            <Dialog open={loginOpen()} onOpenChange={setLoginOpen} title="Log in">
                <Login onComplete={() => setLoginOpen(false)} />
            </Dialog>
            <Dialog open={openOpen()} onOpenChange={setOpenOpen} title="Open">
                <Open />
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

function OpenMenuItem(props: {
    showOpen: () => void;
}) {
    return (
        <MenuItem onSelect={props.showOpen}>
            <LogInIcon />
            <MenuItemLabel>{"Open notebook"}</MenuItemLabel>
        </MenuItem>
    );
}

function Open() {
    const api = useApi();
    const navigate = useNavigate();
    const handleImport = async (data: Document) => {
        console.log("Imported data:", data);

        switch (data.type) {
            case "model": {
                const newRef = await createModel(api, {
                    ...data,
                    name: `${data.name}`,
                });
                navigate(`/model/${newRef}`);
                break;
            }
            // XX: Probably won't work yet
            case "diagram": {
                const newRef = await createDiagram(api, {
                    ...data,
                    name: `${data.name}`,
                });
                navigate(`/diagram/${newRef}`);
                break;
            }

            case "analysis": {
                throw new Error("Analyses don't currently support initialization.");
            }

            default:
                throw new Error("Unknown document type");
        }
    };

    // Placeholder, not doing more than typechecking does for now but 
    // will eventually validate against json schema
    const validateJson = (data: Document) => {
        // Return true if valid
        if (data.name && data.notebook && data.type) {
            return true;
        }
        // Return error message if invalid
        return 'JSON must include "name", "notebook", and "type" fields';
    };

    return (
        <div>
            <JsonImport
                onImport={handleImport}
                validate={validateJson} // Optional
            />
        </div>
    );
}
