import { type Accessor, type ParentProps, createContext, createEffect, useContext } from "solid-js";

import { type FocusHandle, useChildFocus } from "../util/focus";
import type { CellKey } from "./navigation";

type GridFocusContext = {
    activeKey: Accessor<CellKey | null>;
    tabStop: Accessor<CellKey | null>;
    cellFocus: (key: CellKey) => FocusHandle;
};

const Context = createContext<GridFocusContext>();

/** Provide cell focus handles and a single grid tab stop. */
export function GridFocus(
    props: ParentProps<{
        focus: FocusHandle;
        firstCell: CellKey | null;
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
    return {
        selected: () => grid.activeKey() === key(),
        tabindex: () => (grid.tabStop() === key() ? 0 : -1),
        focus: {
            hasFocus: () => grid.cellFocus(key()).hasFocus(),
            setFocused: (focused: boolean) => grid.cellFocus(key()).setFocused(focused),
        } satisfies FocusHandle,
    };
}
