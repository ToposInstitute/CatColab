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

    /** Discard the draft and close the editor. */
    cancelEdit: () => void;

    /** Commit the draft of the edited cell and move the selection. */
    commitEdit: (dir: MoveDirection | "blur") => void;

    /** Toggle a boolean cell. */
    toggleBool: (key: CellKey) => void;

    /** Clear the field of a cell. */
    clearCell: (key: CellKey) => void;

    /** Handle a key pressed on a selected cell: editing, toggling, or
    clearing. Returns whether the key was handled. */
    onCellKey: (evt: KeyboardEvent, key: CellKey) => boolean;

    /** Whether the cell with the given key is the first cell of the grid. */
    isFirstCell: (key: CellKey) => boolean;

    /** Whether refocusing the cell with the given key is temporarily
    suppressed, as just after a commit from a blurred editor. */
    isSuppressed: (key: CellKey) => boolean;
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
    }>,
) {
    const grid = useGridFocus();
    const [edit, setEdit] = createSignal<EditState | null>(null);
    const [suppressed, setSuppressed] = createSignal<CellKey | null>(null);
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
        setSuppressed(null);
        grid.cellFocus(key).setFocused(true);
    };

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

    const cancelEdit = () => setEdit(null);

    /** Commit the text of the open editor, writing to the cell by ID.

    The write is skipped when the row or column has since been removed, or when
    the text does not parse, in which case the cell keeps its previous value.
     */
    const commitEdit = (dir: MoveDirection | "blur") => {
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
            // Focus has moved elsewhere; don't move the selection or steal it
            // back to the edited cell. Suppression is applied before the
            // editor unmounts, which drops the focus it held.
            batch(() => {
                setSuppressed(key);
                setEdit(null);
            });
            return;
        }
        setEdit(null);
        const next = neighborKey(props.table(), headerIndex(), key, dir);
        if (next) {
            select(next);
        }
        // At the edge of the grid the selection stays put; appending a row on
        // exit comes with structural changes.
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

    const clearCell = (key: CellKey) => {
        const cell = resolveCell(key);
        if (!cell || !isEditableCell(cell.header)) {
            return;
        }
        props.onSetField(cell.row, cell.header, null);
    };

    const isFirstCell = (key: CellKey) => {
        const table = props.table();
        const { headerId, rowId } = parseCellKey(key);
        return table.rows[0]?.id === rowId && table.headers[0]?.id === headerId;
    };

    const onCellKey = (evt: KeyboardEvent, key: CellKey): boolean => {
        const cell = resolveCell(key);
        if (!cell || !isEditableCell(cell.header)) {
            return false;
        }
        const isBool = cell.header.type.tag === "Bool";
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
            startEdit(key, evt.key);
        } else {
            return false;
        }
        return true;
    };

    // A draft is only meaningful while its cell is selected.
    createEffect(() => {
        const state = edit();
        if (state && grid.activeKey() !== makeCellKey(state.headerId, state.rowId)) {
            setEdit(null);
        }
    });

    // Suppression only applies while the suppressed cell is still selected.
    createEffect(() => {
        const key = suppressed();
        if (key && grid.activeKey() !== key) {
            setSuppressed(null);
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
                clearCell,
                onCellKey,
                isFirstCell,
                isSuppressed: (key) => suppressed() === key,
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
