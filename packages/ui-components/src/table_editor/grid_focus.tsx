import {
    type Accessor,
    type ParentProps,
    createContext,
    createEffect,
    createMemo,
    createSignal,
    useContext,
} from "solid-js";

import { type FocusHandle, useChildFocus } from "../util/focus";
import type { CellKey } from "./navigation";

type GridFocusContext = {
    activeKey: Accessor<CellKey | null>;
    tabStop: Accessor<CellKey | null>;
    cellFocus: (key: CellKey) => FocusHandle;
    focusRequest: Accessor<{ key: CellKey; version: number } | null>;
    requestFocus: (key: CellKey) => void;
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
    const [focusRequest, setFocusRequest] = createSignal<{ key: CellKey; version: number } | null>(
        null,
    );
    let focusVersion = 0;

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
                focusRequest,
                // Requests are events, not pending work: cells observe the version
                // change once. An editor closing or field updating cannot replay it.
                requestFocus: (key) => setFocusRequest({ key, version: ++focusVersion }),
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
    const focusRequest = createMemo((version: number) => {
        const request = grid.focusRequest();
        // Requests for other cells are not focus events for this cell.
        return request?.key === key() ? request.version : version;
    }, 0);
    return {
        selected,
        focusRequest,
        tabindex: () => (grid.tabStop() === key() ? 0 : -1),
        focus: {
            hasFocus: () => grid.cellFocus(key()).hasFocus(),
            setFocused: (focused: boolean) => grid.cellFocus(key()).setFocused(focused),
        } satisfies FocusHandle,
    };
}
