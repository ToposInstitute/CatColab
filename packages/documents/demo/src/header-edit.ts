import styles from "./HeaderEdit.module.css";

/** Keep grid interactions (sorting, column selection) off the editor. */
const stop = (event: Event) => event.stopPropagation();

/**
 * Inline editing for spreadsheet column headers. jspreadsheet reserves a
 * header double-click for sorting and only offers renaming through the context
 * menu, so the sheet views bind their own double-click: it overlays the header
 * cell with a text input, committing on Enter or blur and cancelling on
 * Escape. The caller decides what a commit means (a schema rename, or a
 * scratch title).
 */
export function editHeaderInline(
    header: HTMLTableCellElement,
    initial: string,
    commit: (value: string) => void,
): void {
    // Re-entering an open editor just refocuses it.
    const existing = header.querySelector<HTMLInputElement>("[data-header-editor]");
    if (existing) {
        existing.focus();
        return;
    }

    const input = document.createElement("input");
    input.dataset.headerEditor = "";
    input.className = styles.headerEditor ?? "";
    input.value = initial;
    input.setAttribute("aria-label", "Column name");

    const previousPosition = header.style.position;
    header.style.position = "relative";

    let closed = false;
    const close = (commitValue: boolean) => {
        if (closed) {
            return;
        }
        closed = true;
        const value = input.value;
        input.remove();
        header.style.position = previousPosition;
        if (commitValue) {
            commit(value.trim());
        }
    };

    input.addEventListener("pointerdown", stop);
    input.addEventListener("mousedown", stop);
    input.addEventListener("click", stop);
    input.addEventListener("dblclick", stop);
    input.addEventListener("keydown", (event) => {
        event.stopPropagation();
        if (event.key === "Enter") {
            close(true);
        } else if (event.key === "Escape") {
            close(false);
        }
    });
    input.addEventListener("blur", () => close(true));

    header.append(input);
    input.focus();
    input.select();
}
