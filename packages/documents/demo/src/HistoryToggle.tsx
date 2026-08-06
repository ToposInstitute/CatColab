/**
 * A toolbar button that toggles a panel's history sidebar, mirroring the
 * frontend's History toggle (the same lucide "history" glyph, drawn inline to
 * avoid pulling `lucide-solid` into the demo directly).
 */
export function HistoryToggle(props: { open: boolean; onToggle: () => void }) {
    return (
        <wired-icon-button
            onClick={() => props.onToggle()}
            title={props.open ? "Hide history" : "Show history"}
            aria-label={props.open ? "Hide history" : "Show history"}
            aria-pressed={props.open}
        >
            <HistoryIcon />
        </wired-icon-button>
    );
}

/** The lucide `history` icon, inlined. */
function HistoryIcon() {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
        >
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <path d="M3 3v5h5" />
            <path d="M12 7v5l4 2" />
        </svg>
    );
}
