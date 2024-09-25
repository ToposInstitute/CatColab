import { useNavigate } from "@solidjs/router";
import CircleHelp from "lucide-solid/icons/circle-help";

import { IconButton } from "../components";

/** Button that navigates to the root help page. */
export function HelpButton() {
    const navigate = useNavigate();

    return (
        <IconButton onClick={() => navigate("/help")} tooltip="Get help about CatColab">
            <CircleHelp />
        </IconButton>
    );
}
