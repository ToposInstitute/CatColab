import { HamburgerMenu } from "./menubar";
import { Toolbar } from "./toolbar";

export function DocumentLoadingScreen() {
    return (
        <div class="growable-container">
            <Toolbar>
                <HamburgerMenu disabled={true}>
                    <div />
                </HamburgerMenu>
                <span class="filler" />
            </Toolbar>
        </div>
    );
}
