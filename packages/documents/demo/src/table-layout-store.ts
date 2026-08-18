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
