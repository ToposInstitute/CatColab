import { useNavigate } from "@solidjs/router";

import { MenuItem, MenuItemLabel } from "./menubar";

import CircleHelp from "lucide-solid/icons/circle-help";

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
