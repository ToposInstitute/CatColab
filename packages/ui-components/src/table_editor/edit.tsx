import {
    batch,
    createContext,
    createEffect,
    createMemo,
    createSignal,
    type Accessor,
    type ParentProps,
    useContext,
} from "solid-js";

import type { InstanceTable, LiteralValue, TableHeader, TableRow } from "catcolab-documents";
import { fieldOf, fieldText } from "./display";
import { isEditableCell, isPrintableKey, parseValue } from "./editing";
import { useGridFocus } from "./grid_focus";
import {
    type CellKey,
    type MoveDirection,
    makeCellKey,
    neighborKey,
    parseCellKey,
} from "./navigation";

/** The cell being edited, by ID, and the live text of its editor. */
export type EditState = { rowId: string; headerId: string; text: string };

type CellEditApi = {
    /** Index of each header ID to its column position. */
    headerIndex: Accessor<ReadonlyMap<string, number>>;

    /** Whether the cell with the given key is being edited. */
    isEditing: (key: CellKey) => boolean;

    /** The live text of the open cell editor. */
    editText: Accessor<string>;

    /** Begin editing the cell with the given key, seeding the editor with
    `text` or, if omitted, with the cell's display text. */
    startEdit: (key: CellKey, text?: string) => void;

    /** Update the draft text of the open editor. */
    setEditText: (text: string) => void;

    /** Discard the draft and return browser focus to its cell. */
    cancelEdit: (cellElement: HTMLTableCellElement) => void;

    /** Commit the draft and move the selection, restoring browser focus to
    the edited cell only if it remains selected after a keyboard exit. */
    commitEdit: (dir: MoveDirection | "blur", cellElement: HTMLTableCellElement) => void;

    /** Toggle a boolean cell. */
    toggleBool: (key: CellKey) => void;

    /** Commit a row reference chosen from the completions popup, leaving the
    selection in place. */
    commitRowRef: (key: CellKey, target: TableRow, cellElement: HTMLTableCellElement) => void;

    /** Clear the field of a cell. */
    clearCell: (key: CellKey) => void;

    /** Add a row through the table's callback, selecting the given column (or
    the first column by default) once it appears. */
    addRow: (headerId?: string) => void;

    /** Stop waiting to select a row being added, as when the user leaves the
    grid before it appears. The add request itself has already been dispatched
    and is not withdrawn; the row simply appears without taking the
    selection. */
    cancelPendingSelection: () => void;

    /** Handle a key pressed on a selected cell: editing, toggling, or
    clearing. Returns whether the key was handled. */
    onCellKey: (evt: KeyboardEvent, key: CellKey) => boolean;
};

const Context = createContext<CellEditApi>();

/** Provide literal cell editing for the grid.

Drafts live here so that they survive the editor being remounted in a
different cell slot when rows or columns shift under it. Cells are resolved
afresh by ID before every write so that they cannot go stale.
 */
export function EditProvider(
    props: ParentProps<{
        table: Accessor<InstanceTable>;
        tables: Accessor<ReadonlyArray<InstanceTable>>;
        onSetField: (row: TableRow, header: TableHeader, value: LiteralValue | TableRow) => void;
        onAddRow: () => void;
    }>,
) {
    const grid = useGridFocus();
    const [edit, setEdit] = createSignal<EditState | null>(null);
    const headerIndex = createMemo(
        () => new Map(props.table().headers.map((header, index) => [header.id, index] as const)),
    );

    /** The cell for a cell key, resolved against the current table. */
    const resolveCell = (key: CellKey) => {
        const { headerId, rowId } = parseCellKey(key);
        const table = props.table();
        const row = table.rows.find((row) => row.id === rowId);
        const header = table.headers.find((header) => header.id === headerId);
        return row && header ? { row, header } : undefined;
    };

    const fieldAt = (row: TableRow, header: TableHeader) =>
        fieldOf(row, headerIndex().get(header.id) ?? -1);

    const select = (key: CellKey) => {
        grid.cellFocus(key).setFocused(true);
    };

    /** The row IDs present when the next added row was promised the selection
    along with the column it should take, or null when none is pending. */
    const [pendingSelection, setPendingSelection] = createSignal<{
        rows: ReadonlySet<string>;
        headerId: string | null;
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
        });
        props.onAddRow();
    };

    const cancelPendingSelection = () => setPendingSelection(null);

    createEffect(() => {
        const pending = pendingSelection();
        if (!pending) {
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
        const cell = resolveCell(key);
        if (!cell || !isEditableCell(cell.header)) {
            return;
        }
        batch(() => {
            select(key);
            setEdit({
                rowId: cell.row.id,
                headerId: cell.header.id,
                text:
                    text ?? fieldText(fieldAt(cell.row, cell.header), cell.header, props.tables()),
            });
        });
    };

    const setEditText = (text: string) => setEdit((state) => (state ? { ...state, text } : state));

    const cancelEdit = (cellElement: HTMLTableCellElement) => {
        const state = edit();
        if (!state) {
            return;
        }
        const key = makeCellKey(state.headerId, state.rowId);
        setEdit(null);
        if (grid.activeKey() === key && edit() === null && cellElement.isConnected) {
            cellElement.focus({ preventScroll: true });
        }
    };

    /** Commit the text of the open editor, writing to the cell by ID.

    The write is skipped when the row or column has since been removed, or when
    the text does not parse, in which case the cell keeps its previous value.
     */
    const commitEdit = (dir: MoveDirection | "blur", cellElement: HTMLTableCellElement) => {
        const state = edit();
        if (state === null) {
            return;
        }
        const key = makeCellKey(state.headerId, state.rowId);
        const cell = resolveCell(key);
        if (cell) {
            const parsed = parseValue(cell.header, state.text);
            if (parsed.ok) {
                props.onSetField(cell.row, cell.header, parsed.value);
            }
        }
        if (dir === "blur") {
            // The browser is already transferring focus; only close the draft.
            setEdit(null);
            return;
        }
        const target = neighborKey(props.table(), headerIndex(), key, dir);
        if (!target && (dir === "down" || dir === "forward")) {
            // Exiting the grid downward or forward adds a row, ready for
            // further editing in the same column.
            batch(() => {
                setEdit(null);
                addRow(state.headerId);
            });
            if (grid.activeKey() === key && edit() === null && cellElement.isConnected) {
                cellElement.focus({ preventScroll: true });
            }
            return;
        }
        batch(() => {
            setEdit(null);
            select(target ?? key);
        });
        // A newly selected cell focuses itself. If selection stayed here,
        // return browser focus directly to the edited cell.
        if (grid.activeKey() === key && edit() === null && cellElement.isConnected) {
            cellElement.focus({ preventScroll: true });
        }
        // Appending a row on exit comes with structural changes.
    };

    const toggleBool = (key: CellKey) => {
        const cell = resolveCell(key);
        if (!cell || cell.header.type.tag !== "Bool") {
            return;
        }
        const field = fieldAt(cell.row, cell.header);
        const current = field?.tag === "Bool" ? field.content.value : false;
        props.onSetField(cell.row, cell.header, !current);
    };

    /** The row reference is committed by the completion itself; the editor
    simply closes without moving the selection. */
    const commitRowRef = (key: CellKey, target: TableRow, cellElement: HTMLTableCellElement) => {
        const state = edit();
        if (!state || makeCellKey(state.headerId, state.rowId) !== key) {
            return;
        }
        const cell = resolveCell(key);
        if (cell) {
            props.onSetField(cell.row, cell.header, target);
        }
        setEdit(null);
        if (grid.activeKey() === key && edit() === null && cellElement.isConnected) {
            cellElement.focus({ preventScroll: true });
        }
    };

    const clearCell = (key: CellKey) => {
        const cell = resolveCell(key);
        if (!cell || !isEditableCell(cell.header)) {
            return;
        }
        props.onSetField(cell.row, cell.header, null);
    };

    const onCellKey = (evt: KeyboardEvent, key: CellKey): boolean => {
        const cell = resolveCell(key);
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
        if (grid.activeKey() !== key || !resolveCell(key)) {
            setEdit(null);
        }
    });

    return (
        <Context.Provider
            value={{
                headerIndex,
                isEditing,
                editText: () => edit()?.text ?? "",
                startEdit,
                setEditText,
                cancelEdit,
                commitEdit,
                toggleBool,
                commitRowRef,
                clearCell,
                addRow,
                cancelPendingSelection,
                onCellKey,
            }}
        >
            {props.children}
        </Context.Provider>
    );
}

/** Access the edit controller of the enclosing grid. */
export function useCellEdit(): CellEditApi {
    const edit = useContext(Context);
    if (!edit) {
        throw new Error("Grid cells must be inside EditProvider");
    }
    return edit;
}
