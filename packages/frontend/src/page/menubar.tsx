import { DropdownMenu } from "@kobalte/core/dropdown-menu";
import type { JSX } from "solid-js";

import { IconButton } from "../components";

import MenuIcon from "lucide-solid/icons/menu";

import "./menubar.css";

/** Menu triggered from a hamburger button. */
export function HamburgerMenu(props: {
    children: JSX.Element;
}) {
    return (
        <DropdownMenu>
            <DropdownMenu.Trigger as={IconButton}>
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
