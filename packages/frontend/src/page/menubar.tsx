import { Menubar } from "@kobalte/core/menubar";
import type { JSX } from "solid-js";

import { IconButton } from "../components";

import MenuIcon from "lucide-solid/icons/menu";

import "./menubar.css";

/** Menu triggered from a hamburger button. */
export function HamburgerMenu(props: {
    children: JSX.Element;
}) {
    return (
        <Menubar focusOnAlt={false}>
            <Menubar.Menu>
                <Menubar.Trigger as={IconButton}>
                    <MenuIcon />
                </Menubar.Trigger>
                <Menubar.Portal>
                    <Menubar.Content class="menu popup">{props.children}</Menubar.Content>
                </Menubar.Portal>
            </Menubar.Menu>
        </Menubar>
    );
}
