import { type JSX, createSignal } from "solid-js";

import "./layout.css";

import ChevronsRight from "lucide-solid/icons/chevrons-right";
import ChevronsLeft from "lucide-solid/icons/chevrons-left";
import MenuIcon from "lucide-solid/icons/menu";

export function Layout(props: {
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
                        <IconButton onClick={props.closeSidebar}>
                            <ChevronsLeft />
                        </IconButton>
                    </div>
                    {props.children}
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

function IconButton(props: {
    children: JSX.Element;
    onClick?: () => void;
}) {
    return (
        <div onClick={props.onClick} class="icon-button" role="button">
            <div>{props.children}</div>
        </div>
    );
}
