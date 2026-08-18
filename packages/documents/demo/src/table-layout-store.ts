import { createSignal } from "solid-js";

import {
    emptyTableLayout,
    parseTableLayout,
    TABLE_LAYOUT_STORAGE_KEY,
    type TableLayout,
} from "./table-layout";

/**
 * The saved table layout as app-wide shared state, so the tables list in the
 * file sidebar and the instance panel's grids stay in sync. The signals live at
 * module scope because the layout is a singleton anyway: it is persisted under
 * one localStorage key and shared by every view that renders the tables.
 */

function loadTableLayout(): TableLayout {
    try {
        return parseTableLayout(localStorage.getItem(TABLE_LAYOUT_STORAGE_KEY));
    } catch {
        return emptyTableLayout();
    }
}

const [savedLayout, setSavedLayout] = createSignal(loadTableLayout());

/** The last committed table layout, as loaded/persisted from localStorage. */
export const savedTableLayout = savedLayout;

/** Apply an update to the saved layout and persist it. */
export const commitTableLayout = (update: (current: TableLayout) => TableLayout) => {
    const next = update(savedLayout());
    setSavedLayout(next);
    try {
        localStorage.setItem(TABLE_LAYOUT_STORAGE_KEY, JSON.stringify(next));
    } catch (error) {
        console.warn("Could not persist table layout", error);
    }
};

/**
 * Expand the given table and raise its grid to the top, whether or not it was
 * already expanded — the action behind selecting a table in the file sidebar.
 */
export const raiseTable = (tableId: string) =>
    commitTableLayout((current) => ({
        ...current,
        hiddenTables: current.hiddenTables.filter((id) => id !== tableId),
        expandedOrder: [tableId, ...current.expandedOrder.filter((id) => id !== tableId)],
    }));

/**
 * Collapse the given table down to nothing but its sidebar entry, closing its
 * grid — the action behind deselecting an expanded table in the file sidebar.
 */
export const collapseTable = (tableId: string) =>
    commitTableLayout((current) => ({
        ...current,
        hiddenTables: current.hiddenTables.includes(tableId)
            ? current.hiddenTables
            : [...current.hiddenTables, tableId],
        expandedOrder: current.expandedOrder.filter((id) => id !== tableId),
    }));
