import {
    type Accessor,
    type ParentProps,
    createContext,
    createEffect,
    createMemo,
    useContext,
} from "solid-js";

import { type FocusHandle, useChildFocus } from "../util/focus";
import type { CellKey } from "./navigation";

type GridFocusContext = {
    activeKey: Accessor<CellKey | null>;
    tabStop: Accessor<CellKey | null>;
    cellFocus: (key: CellKey) => FocusHandle;
};

const Context = createContext<GridFocusContext>();

/** Provide cell focus handles and a single grid tab stop.

When `resolveCell` is given, it is asked to map the selected cell to a cell
that still exists; rows and columns may be removed or shifted concurrently
with the selection.
 */
export function GridFocus(
    props: ParentProps<{
        focus: FocusHandle;
        firstCell: CellKey | null;
        resolveCell?: (key: CellKey) => CellKey | null;
    }>,
) {
    const parent: FocusHandle = {
        hasFocus: () => props.focus.hasFocus(),
        setFocused: (focused) => props.focus.setFocused(focused),
    };
    const children = useChildFocus<CellKey>(parent);
    const activeKey = () => (parent.hasFocus() ? children.activeChild() : null);

    createEffect(() => {
        if (parent.hasFocus() && children.activeChild() === null && props.firstCell) {
            children.setActiveChild(props.firstCell);
        }
    });

    // Follow structural changes while the grid has focus: if the selected row
    // or column is removed, select the nearest surviving cell. When the grid
    // loses focus the selection resets anyway, so focus is never stolen from
    // wherever the user went.
    createEffect(() => {
        if (!parent.hasFocus()) {
            return;
        }
        const key = children.activeChild();
        if (key === null || !props.resolveCell) {
            return;
        }
        const repaired = props.resolveCell(key);
        if (repaired !== key) {
            children.setActiveChild(repaired);
        }
    });

    return (
        <Context.Provider
            value={{
                activeKey,
                tabStop: () => activeKey() ?? props.firstCell,
                cellFocus: children.childFocus,
            }}
        >
            {props.children}
        </Context.Provider>
    );
}

export function useGridFocus() {
    const focus = useContext(Context);
    if (!focus) {
        throw new Error("Grid cells must be inside GridFocus");
    }
    return focus;
}

/** Resolve the key lazily: Index slots may acquire different row/header IDs. */
export function useGridCellFocus(key: Accessor<CellKey>) {
    const grid = useGridFocus();
    const selected = createMemo(() => grid.activeKey() === key());
    return {
        selected,
        tabindex: () => (grid.tabStop() === key() ? 0 : -1),
        focus: {
            hasFocus: () => grid.cellFocus(key()).hasFocus(),
            setFocused: (focused: boolean) => grid.cellFocus(key()).setFocused(focused),
        } satisfies FocusHandle,
    };
}
