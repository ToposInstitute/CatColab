import Popover from "@corvu/popover";
import { useNavigate } from "@solidjs/router";
import { getAuth, signOut } from "firebase/auth";
import { useAuth, useFirebaseApp } from "solid-firebase";
import { type JSX, Show, useContext } from "solid-js";
import invariant from "tiny-invariant";

import { IconButton } from "catcolab-ui-components";
import type { Document } from "catlog-wasm";
import { useApi } from "../api";
import { createModel } from "../model/document";
import { TheoryLibraryContext } from "../theory";
import { copyToClipboard, downloadJson } from "../util/json_export";
import { PageActionsContext } from "./context";

import CopyToClipboard from "lucide-solid/icons/clipboard-copy";
import Copy from "lucide-solid/icons/copy";
import Export from "lucide-solid/icons/download";
import FilePlus from "lucide-solid/icons/file-plus";
import Files from "lucide-solid/icons/files";
import HomeIcon from "lucide-solid/icons/home";
import Info from "lucide-solid/icons/info";
import LogInIcon from "lucide-solid/icons/log-in";
import LogOutIcon from "lucide-solid/icons/log-out";
import MenuIcon from "lucide-solid/icons/menu";
import SettingsIcon from "lucide-solid/icons/settings";
import UploadIcon from "lucide-solid/icons/upload";
import X from "lucide-solid/icons/x";

import "./menubar.css";

/** Menu triggered from a hamburger button. */
export function HamburgerMenu(props: {
    children: JSX.Element;
    disabled?: boolean;
}) {
    return (
        <Popover
            placement="bottom-start"
            floatingOptions={{
                offset: 4,
                flip: true,
                shift: true,
            }}
        >
            <Popover.Trigger as={IconButton} disabled={props.disabled}>
                <MenuIcon />
            </Popover.Trigger>
            <Popover.Portal>
                <Popover.Content class="menu popup">{props.children}</Popover.Content>
            </Popover.Portal>
        </Popover>
    );
}

import { type Component, type JSX as SolidJSX, createSignal, splitProps } from "solid-js";

/** Menu item component for use within HamburgerMenu. */
export const MenuItem: Component<{
    children: SolidJSX.Element;
    disabled?: boolean;
    onSelect?: () => void;
}> = (props) => {
    const [local, others] = splitProps(props, ["children", "disabled", "onSelect"]);
    const dialogContext = Popover.useDialogContext();
    const [isHighlighted, setIsHighlighted] = createSignal(false);

    const handleClick = () => {
        if (!local.disabled && local.onSelect) {
            local.onSelect();
            dialogContext?.setOpen(false);
        }
    };

    return (
        <div
            role="menuitem"
            tabIndex={local.disabled ? -1 : 0}
            aria-disabled={local.disabled}
            data-disabled={local.disabled ? "" : undefined}
            data-highlighted={isHighlighted() ? "" : undefined}
            onClick={handleClick}
            onMouseEnter={() => setIsHighlighted(true)}
            onMouseLeave={() => setIsHighlighted(false)}
            onFocus={() => setIsHighlighted(true)}
            onBlur={() => setIsHighlighted(false)}
            onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleClick();
                }
            }}
            {...others}
        >
            {local.children}
        </div>
    );
};

export const MenuItemLabel: Component<{ children: SolidJSX.Element }> = (props) => {
    return <span>{props.children}</span>;
};

export const MenuSeparator: Component = () => {
    return <hr role="separator" style={{ margin: "0.5ex 0", "border-top": "1px solid #e5e7eb" }} />;
};

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
                <Show when={auth.data} fallback={<LogInMenuItem />}>
                    <HomeMenuItem />
                    <DocumentsMenuItem />
                    <SettingsMenuItem />
                    <LogOutMenuItem />
                </Show>
                <MenuSeparator />
                <HelpMenuItem />
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
        const newRef = await createModel(api, theories.defaultTheoryMetadata().id);
        navigate(`/model/${newRef}`);
    };

    return (
        <MenuItem onSelect={onNewModel}>
            <FilePlus />
            <MenuItemLabel>{"New model"}</MenuItemLabel>
        </MenuItem>
    );
}

/** Menu item to duplicate a document. */
export function DuplicateMenuItem(props: {
    doc: Document;
}) {
    const api = useApi();
    const navigate = useNavigate();

    const onDuplicate = async () => {
        const newRef = await api.duplicateDoc(props.doc);
        navigate(`/${props.doc.type}/${newRef}`);
    };

    return (
        <MenuItem onSelect={onDuplicate}>
            <Copy />
            <MenuItemLabel>{`Duplicate ${props.doc.type}`}</MenuItemLabel>
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

/** Menu item to export document as JSON. */
export function ExportJSONMenuItem(props: {
    doc: Document;
}) {
    const onExportJSON = () => downloadJson(JSON.stringify(props.doc), `${props.doc.name}.json`);

    return (
        <MenuItem onSelect={onExportJSON}>
            <Export />
            <MenuItemLabel>{`Export ${props.doc.type}`}</MenuItemLabel>
        </MenuItem>
    );
}

/** Menu item to copy document to clipboard in JSON format. */
export function CopyJSONMenuItem(props: {
    doc: Document;
}) {
    const onCopyJSON = () => copyToClipboard(JSON.stringify(props.doc));

    return (
        <MenuItem onSelect={onCopyJSON}>
            <CopyToClipboard />
            <MenuItemLabel>{`Copy ${props.doc.type} to clipboard`}</MenuItemLabel>
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

function HomeMenuItem() {
    const navigate = useNavigate();

    return (
        <MenuItem onSelect={() => navigate("/")}>
            <HomeIcon />
            <MenuItemLabel>{"Home"}</MenuItemLabel>
        </MenuItem>
    );
}

function DocumentsMenuItem() {
    const navigate = useNavigate();

    return (
        <MenuItem onSelect={() => navigate("/documents")}>
            <Files />
            <MenuItemLabel>{"My documents"}</MenuItemLabel>
        </MenuItem>
    );
}

/** Menu item to delete a document. */
export function DeleteMenuItem(props: {
    refId: string | undefined;
    name: string | null;
    typeName: string;
    canDelete: boolean;
}) {
    const navigate = useNavigate();
    const actions = useContext(PageActionsContext);
    invariant(actions, "Page actions should be provided");

    const handleDelete = async () => {
        invariant(props.refId, "No document reference found");
        const success = await actions.showDeleteDialog({
            refId: props.refId,
            name: props.name,
            typeName: props.typeName,
        });
        if (success) {
            navigate("/documents");
        }
    };

    return (
        <MenuItem disabled={!props.canDelete} onSelect={handleDelete}>
            <X />
            <MenuItemLabel>{`Delete ${props.typeName}`}</MenuItemLabel>
        </MenuItem>
    );
}
