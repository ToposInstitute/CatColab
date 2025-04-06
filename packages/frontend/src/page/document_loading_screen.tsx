import { TheoryHelpButton, Toolbar } from "./toolbar";

export default function DocumentLoadingScreen() {
    return (
        <div class="growable-container">
            <Toolbar>
                <span class="filler" />
                <TheoryHelpButton />
            </Toolbar>
            <div class="notebook-container">Loading...</div>
        </div>
    );
}
