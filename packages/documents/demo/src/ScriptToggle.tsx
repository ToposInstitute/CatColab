/** A toolbar button that toggles the demo's single (app-wide) script pane. */
export function ScriptToggle(props: { open: boolean; onToggle: () => void }) {
    return (
        <wired-button onClick={() => props.onToggle()} aria-pressed={props.open} elevation="2">
            Script
        </wired-button>
    );
}
