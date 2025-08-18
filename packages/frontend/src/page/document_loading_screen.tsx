import { HamburgerMenu } from "./menubar";
import { TheoryHelpButton, Toolbar } from "./toolbar";

export function DocumentLoadingScreen() {
    return (
        <div class="growable-container">
            <Toolbar>
                <HamburgerMenu disabled={true}>
                    <div />
                </HamburgerMenu>
                <span class="filler" />
                <TheoryHelpButton />
            </Toolbar>
        </div>
    );
}
