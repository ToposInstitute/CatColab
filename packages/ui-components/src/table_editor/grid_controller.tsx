import {
    batch,
    createContext,
    createEffect,
    createMemo,
    createSignal,
    createUniqueId,
    on,
    type Accessor,
    type ParentProps,
    useContext,
} from "solid-js";

import type { InstanceTable, LiteralValue, TableHeader, TableRow } from "catcolab-documents";
import { type FocusHandle, useChildFocus } from "../util/focus";
import { fieldText } from "./display";
import { isEditableCell, isPrintableKey, parseValue } from "./editing";
import {
    type CellKey,
    type MoveDirection,
    makeCellKey,
    neighborKey,
    parseCellKey,
} from "./navigation";

/** The cell being edited, by ID, and the live text of its editor. */
export type EditState = { rowId: string; headerId: string; text: string };

type GridControllerProps = {
    focus: FocusHandle;
    table: Accessor<InstanceTable>;
    allTables: Accessor<ReadonlyArray<InstanceTable>>;
    onSetField: (row: TableRow, header: TableHeader, value: LiteralValue | TableRow) => void;
    onAddRow: () => void;
};

const Context = createContext<ReturnType<typeof createGridController>>();

/** Own selection, focus restoration, and editing for one grid.

Drafts live here so that they survive the editor being remounted in a
different cell slot when rows or columns shift under it. Cells are resolved
afresh by ID before every write so that they cannot go stale.
 */
function createGridController(props: GridControllerProps) {
    const tableFocus: FocusHandle = {
        hasFocus: () => props.focus.hasFocus(),
        setFocused: (focused) => props.focus.setFocused(focused),
    };
    // The footer can own a pending row selection without selecting a grid cell.
    const regions = useChildFocus<"grid" | "footer">(tableFocus);
    const parent = regions.childFocus("grid");
    const children = useChildFocus<CellKey>(parent);
    const activeKey = () => (parent.hasFocus() ? children.activeChild() : null);
    const instanceId = createUniqueId();
    const cellId = (key: CellKey) => `${instanceId}-${encodeURIComponent(key)}`;
    const [gridElement, setGridElement] = createSignal<HTMLTableElement>();

    // Remember only the selected row's position, not every row ever seen.
    const selection = createMemo((previous: { key: CellKey; rowIndex: number } | null) => {
        const key = activeKey();
        if (key === null) {
            return null;
        }
        const { headerId, rowId } = parseCellKey(key);
        const { rows, headers } = props.table();
        if (!rows.length || !headers.length) {
            return null;
        }
        const currentIndex = rows.findIndex((row) => row.id === rowId);
        const lastIndex =
            previous && parseCellKey(previous.key).rowId === rowId ? previous.rowIndex : 0;
        const rowIndex = currentIndex >= 0 ? currentIndex : Math.min(lastIndex, rows.length - 1);
        const header = headers.find((header) => header.id === headerId) ?? headers[0]!;
        return { key: makeCellKey(header.id, rows[rowIndex]!.id), rowIndex };
    }, null);
    createEffect(() => {
        if (parent.hasFocus()) {
            const key = selection()?.key ?? null;
            if (key !== children.activeChild()) {
                children.setActiveChild(key);
            }
        }
    });

    const [edit, setEdit] = createSignal<EditState | null>(null);
    const headerIndex = createMemo(
        () => new Map(props.table().headers.map((header, index) => [header.id, index] as const)),
    );

    /** The cell for a cell key, resolved against the current table. */
    const findCell = (key: CellKey) => {
        const { headerId, rowId } = parseCellKey(key);
        const table = props.table();
        const row = table.rows.find((row) => row.id === rowId);
        const header = table.headers.find((header) => header.id === headerId);
        return row && header ? { row, header } : undefined;
    };

    const fieldAt = (row: TableRow, header: TableHeader) =>
        row.fields[headerIndex().get(header.id) ?? -1];

    const select = (key: CellKey) => {
        children.childFocus(key).setFocused(true);
    };

    const enterGrid = () => {
        parent.setFocused(true);
        if (children.activeChild() === null) {
            const { rows, headers } = props.table();
            if (rows[0] && headers[0]) {
                select(makeCellKey(headers[0].id, rows[0].id));
            }
        }
    };

    // Navigation changes logical selection, not the browser's focused cell.
    createEffect(
        on([activeKey, gridElement, () => edit() !== null], ([key, element, editing]) => {
            if (key && element && !editing) {
                element.focus({ preventScroll: true });
                document
                    .getElementById(cellId(key))
                    ?.scrollIntoView({ block: "nearest", inline: "nearest" });
            }
        }),
    );

    /** Commit the previous draft before selecting a different cell. */
    const selectFromPointer = (key: CellKey) => {
        batch(() => {
            if (edit() && !isEditing(key)) {
                commitEdit();
            }
            select(key);
        });
    };

    /** The row IDs present when the next added row was promised the selection
    along with the column it should take, or null when none is pending. */
    const [pendingSelection, setPendingSelection] = createSignal<{
        rows: ReadonlySet<string>;
        headerId: string | null;
        owner: "grid" | "footer";
    } | null>(null);

    /** Add a row, selecting the given column (or the first column) of the row
    once it appears.

    The callback does not report the new row's ID, so the row is identified as
    the first row that was not present when the request was made. If another
    row is added concurrently, the selection may land on it instead; the
    callback contract leaves this ambiguous.
     */
    const addRow = (headerId?: string) => {
        setPendingSelection({
            rows: new Set(props.table().rows.map((row) => row.id)),
            headerId: headerId ?? null,
            owner: regions.activeChild() ?? "grid",
        });
        props.onAddRow();
    };

    const enterFooter = () => {
        batch(() => {
            commitEdit();
            regions.childFocus("footer").setFocused(true);
        });
    };

    const leaveTable = () => {
        batch(() => {
            // Commit before ownership loss invalidates the draft.
            commitEdit();
            setPendingSelection(null);
            tableFocus.setFocused(false);
        });
    };

    createEffect(() => {
        const pending = pendingSelection();
        if (!pending) {
            return;
        }
        if (!regions.childFocus(pending.owner).hasFocus()) {
            setPendingSelection(null);
            return;
        }
        const table = props.table();
        const newRow = table.rows.find((row) => !pending.rows.has(row.id));
        if (!newRow) {
            return;
        }
        const headerId = pending.headerId ?? table.headers[0]?.id;
        setPendingSelection(null);
        if (headerId !== undefined) {
            select(makeCellKey(headerId, newRow.id));
        }
    });

    const isEditing = (key: CellKey) => {
        const state = edit();
        return state !== null && makeCellKey(state.headerId, state.rowId) === key;
    };

    const startEdit = (key: CellKey, text?: string) => {
        const cell = findCell(key);
        if (!cell || !isEditableCell(cell.header)) {
            return;
        }
        batch(() => {
            if (edit() && !isEditing(key)) {
                commitEdit();
            }
            select(key);
            setEdit({
                rowId: cell.row.id,
                headerId: cell.header.id,
                text:
                    text ??
                    fieldText(fieldAt(cell.row, cell.header), cell.header, props.allTables()),
            });
        });
    };

    const setEditText = (text: string) => setEdit((state) => (state ? { ...state, text } : state));

    const finishEdit = (key: CellKey, dir?: MoveDirection) => {
        batch(() => {
            setEdit(null);
            if (dir) {
                const target = neighborKey(props.table(), headerIndex(), key, dir);
                if (!target && dir === "down") {
                    addRow(parseCellKey(key).headerId);
                } else {
                    select(target ?? key);
                }
            }
        });
    };

    const cancelEdit = () => {
        const state = edit();
        if (state) {
            finishEdit(makeCellKey(state.headerId, state.rowId));
        }
    };

    /** Commit the text of the open editor, writing to the cell by ID.

    The write is skipped when the row or column has since been removed, or when
    the text does not parse, in which case the cell keeps its previous value.
     */
    const commitEdit = (dir?: MoveDirection) => {
        const state = edit();
        if (state === null) {
            return;
        }
        const key = makeCellKey(state.headerId, state.rowId);
        const cell = findCell(key);
        if (cell) {
            const parsed = parseValue(cell.header, state.text);
            if (parsed.ok) {
                props.onSetField(cell.row, cell.header, parsed.value);
            }
        }
        finishEdit(key, dir);
    };

    const toggleBool = (key: CellKey) => {
        const cell = findCell(key);
        if (!cell || cell.header.type.tag !== "Bool") {
            return;
        }
        const field = fieldAt(cell.row, cell.header);
        const current = field?.tag === "Bool" ? field.content.value : false;
        props.onSetField(cell.row, cell.header, !current);
    };

    /** The row reference is committed by the completion itself; the editor
    simply closes without moving the selection. */
    const commitRowRef = (key: CellKey, target: TableRow) => {
        const state = edit();
        if (!state || makeCellKey(state.headerId, state.rowId) !== key) {
            return;
        }
        const cell = findCell(key);
        if (cell) {
            props.onSetField(cell.row, cell.header, target);
        }
        finishEdit(key);
    };

    const clearCell = (key: CellKey) => {
        const cell = findCell(key);
        if (!cell || !isEditableCell(cell.header)) {
            return;
        }
        props.onSetField(cell.row, cell.header, null);
    };

    const onCellKey = (evt: KeyboardEvent, key: CellKey): boolean => {
        const cell = findCell(key);
        if (!cell || !isEditableCell(cell.header)) {
            return false;
        }
        const isBool = cell.header.type.tag === "Bool";
        const isRowRef = cell.header.type.tag === "RowRef";
        if (evt.key === "Enter" || evt.key === "F2") {
            if (isBool) {
                toggleBool(key);
            } else {
                startEdit(key);
            }
        } else if (evt.key === " " && isBool) {
            toggleBool(key);
        } else if (evt.key === "Delete" || evt.key === "Backspace") {
            clearCell(key);
        } else if (!isBool && isPrintableKey(evt)) {
            // A row reference is read-only: any key just opens its completions.
            startEdit(key, isRowRef ? undefined : evt.key);
        } else {
            return false;
        }
        return true;
    };

    // A draft is only meaningful while its cell is selected and still exists.
    createEffect(() => {
        const state = edit();
        if (!state) {
            return;
        }
        const key = makeCellKey(state.headerId, state.rowId);
        if (!findCell(key)) {
            setEdit(null);
        } else if (activeKey() !== key) {
            // Logical transfers can also originate outside this controller.
            commitEdit();
        }
    });

    return {
        activeKey,
        cellId,
        setGridElement,
        enterGrid,
        enterFooter,
        leaveGrid: () => {
            if (parent.hasFocus()) {
                leaveTable();
            }
        },
        leaveFooter: () => {
            if (regions.childFocus("footer").hasFocus()) {
                leaveTable();
            }
        },
        selectFromPointer,
        cellFocus: children.childFocus,
        headerIndex,
        isEditing,
        hasEditor: () => edit() !== null,
        editText: () => edit()?.text ?? "",
        startEdit,
        setEditText,
        cancelEdit,
        commitEdit,
        toggleBool,
        commitRowRef,
        addRow,
        onCellKey,
    };
}

export function GridProvider(props: ParentProps<GridControllerProps>) {
    return (
        <Context.Provider value={createGridController(props)}>{props.children}</Context.Provider>
    );
}

export function useGridController() {
    const controller = useContext(Context);
    if (!controller) {
        throw new Error("Grid cells must be inside GridProvider");
    }
    return controller;
}
