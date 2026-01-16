import { createSignal, type JSX } from "solid-js";

import "./sidebar_layout.css";

import ChevronsLeft from "lucide-solid/icons/chevrons-left";
import MenuIcon from "lucide-solid/icons/menu";

import { IconButton } from "catcolab-ui-components";
import { copyDebugData, getDebugStatus } from "../debug/debug_store";
import { AppMenu, ImportMenuItem, NewModelItem } from "./menubar";

export function SidebarLayout(props: {
    children?: JSX.Element;
    toolbarContents?: JSX.Element;
    sidebarContents?: JSX.Element;
}) {
    const [sidebarOpen, setSidebarOpen] = createSignal(true);

    return (
        <div class="layout">
            <Sidebar isOpen={sidebarOpen()} closeSidebar={() => setSidebarOpen(false)}>
                {props.sidebarContents}
            </Sidebar>

            <div class="content">
                <Header isSidebarOpen={sidebarOpen()} openSidebar={() => setSidebarOpen(true)}>
                    {props.toolbarContents}
                </Header>

                <main>{props.children}</main>
            </div>
        </div>
    );
}

function Sidebar(props: { isOpen: boolean; closeSidebar: () => void; children?: JSX.Element }) {
    return (
        <div class={`sidebar ${props.isOpen ? "open" : "closed"}`}>
            {props.isOpen && (
                <div class="sidebar-content">
                    <div class="sidebar-header">
                        <AppMenu>
                            <NewModelItem />
                            <ImportMenuItem />
                        </AppMenu>
                        <div class="collapse-button">
                            <IconButton onClick={props.closeSidebar}>
                                <ChevronsLeft />
                            </IconButton>
                        </div>
                    </div>
                    {props.children}
                    <div
                        style={{
                            "margin-top": "auto",
                            padding: "0.5rem",
                            "border-top": "1px solid var(--sl-color-neutral-200)",
                        }}
                    >
                        <button
                            onClick={copyDebugData}
                            style={{
                                padding: "0.25rem 0.5rem",
                                cursor: "pointer",
                                "font-size": "0.8rem",
                            }}
                        >
                            Debug
                        </button>
                        <span style={{ "margin-left": "0.5rem", "font-size": "0.8rem" }}>
                            {getDebugStatus()}
                        </span>
                    </div>
                </div>
            )}
        </div>
    );
}

function Header(props: {
    isSidebarOpen: boolean;
    openSidebar: () => void;
    children?: JSX.Element;
}) {
    return (
        <header class="toolbar">
            {!props.isSidebarOpen && (
                <IconButton onClick={props.openSidebar}>
                    <MenuIcon />
                </IconButton>
            )}
            {props.children}
        </header>
    );
}
