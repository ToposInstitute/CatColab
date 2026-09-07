import ChevronDown from "lucide-solid/icons/chevron-down";
import { batch, createEffect, createMemo, createSignal, Index, onCleanup, Show } from "solid-js";

import type {
    FieldValue,
    InstanceTable,
    LiteralValue,
    TableHeader,
    TableIssue,
    TableRow,
} from "catcolab-documents";
import type { Completion } from "../completions";
import { TextInput } from "../text_input";
import { type FocusHandle, useChildFocus } from "../util/focus";

import styles from "./table_editor.module.css";

/** Column widths in pixels, by header type. */
const COLUMN_WIDTHS = {
    Bool: 80,
    Int: 100,
    Float: 100,
    String: 180,
    RowRef: 220,
    Unknown: 180,
} as const;

const DELETE_COLUMN_WIDTH = 36;
const EMPTY_COLUMN_WIDTH = 180;

/** A cell resolved to its current row and header objects.

Never stored: cells are resolved afresh from the table so that they cannot go
stale when rows or columns change under the editor.
 */
type Cell = { row: TableRow; header: TableHeader };

/** Identifies a cell by header and row ID, so it is stable as either are shuffled. */
type CellKey = `${string}\u0000${string}`;

/** The cell being edited, by ID, and the live text of its editor. */
type EditState = { rowId: string; headerId: string; text: string };

type PendingAppend = { headerId: string; previousRowIds: ReadonlySet<string> };

type PendingDelete = { rowId: string };

/** Direction to move the selection after leaving a cell editor. */
type MoveDirection = "up" | "down" | "left" | "right" | "forward" | "backward" | "stay";

export type TableEditorProps = {
    /** The table to display and edit. */
    table: InstanceTable;

    /** All tables in the instance, including this one.

    Used to resolve the rows referenced by `RowRef` columns.
     */
    tables: ReadonlyArray<InstanceTable>;

    /** Validation issues for this table and its fields, matched by `path`. */
    issues?: ReadonlyArray<TableIssue>;

    class?: string;

    /** Focus state used to compose this editor into a larger focus tree. */
    focus: FocusHandle;

    /** Called when the user edits a cell.

    A `TableRow` value sets a row reference; `null` clears the field.
     */
    onSetField: (row: TableRow, header: TableHeader, value: LiteralValue | TableRow) => void;

    /** Called when the user adds a row. */
    onAddRow: () => void;

    /** Called when the user deletes a row. */
    onDeleteRow: (row: TableRow) => void;
};

/** A spreadsheet-like editor for a tabular data instance.
 */
export function TableEditor(props: TableEditorProps) {
    const [edit, setEdit] = createSignal<EditState | null>(null);
    const [pendingAppend, setPendingAppend] = createSignal<PendingAppend | null>(null);
    const [pendingDelete, setPendingDelete] = createSignal<PendingDelete | null>(null);
    const [suppressedFocus, setSuppressedFocus] = createSignal<CellKey | null>(null);
    const [focusRequest, setFocusRequest] = createSignal(0);

    // Forward to the prop lazily in case the handle changes.
    const parentFocus: FocusHandle = {
        hasFocus: () => props.focus.hasFocus(),
        setFocused: (focused) => props.focus.setFocused(focused),
    };
    // No active child means the first cell is selected.
    const focus = useChildFocus<CellKey>(parentFocus);

    const rows = () => props.table.rows;
    const headers = () => props.table.headers;

    const headerIndex = createMemo(
        () => new Map(headers().map((header, index) => [header.id, index] as const)),
    );

    const keyOf = (cell: Cell): CellKey => makeCellKey(cell.header.id, cell.row.id);

    const resolveCell = (rowId: string, headerId: string): Cell | undefined => {
        const row = rows().find((row) => row.id === rowId);
        const header = headers().find((header) => header.id === headerId);
        return row && header ? { row, header } : undefined;
    };

    const fieldOf = (cell: Cell): FieldValue | undefined => {
        const index = headerIndex().get(cell.header.id);
        return index === undefined ? undefined : cell.row.fields[index];
    };

    /** The adjacent cell in a direction, or `undefined` at the edge of the grid.

    This is the only place that reasons about the order of rows and columns.
     */
    const neighbor = (cell: Cell, dir: MoveDirection): Cell | undefined => {
        if (dir === "stay") {
            return cell;
        }
        const allHeaders = headers();
        let rowIndex = cell.row.index;
        let colIndex = headerIndex().get(cell.header.id) ?? 0;
        if (dir === "up") {
            rowIndex -= 1;
        } else if (dir === "down") {
            rowIndex += 1;
        } else if (dir === "left") {
            colIndex -= 1;
        } else if (dir === "right") {
            colIndex += 1;
        } else if (dir === "forward") {
            colIndex += 1;
            if (colIndex >= allHeaders.length) {
                rowIndex += 1;
                colIndex = 0;
            }
        } else if (dir === "backward") {
            colIndex -= 1;
            if (colIndex < 0) {
                rowIndex -= 1;
                colIndex = allHeaders.length - 1;
            }
        }
        const row = rows()[rowIndex];
        const header = allHeaders[colIndex];
        return row && header ? { row, header } : undefined;
    };

    const isFirstCell = (cell: Cell) => neighbor(cell, "backward") === undefined;

    const isEditable = (cell: Cell) => cell.header.type.tag !== "Unknown";

    /** The table referenced by a `RowRef` column, if it can be resolved. */
    const codomainOf = (header: TableHeader): InstanceTable | undefined => {
        const type = header.type;
        if (type.tag !== "RowRef") {
            return undefined;
        }
        return props.tables.find((table) => table.id === type.content.id);
    };

    /** The selected cell, resolved against the current table.

    Nothing is selected while a row is being appended: the selection lands on
    the new row once it appears.
     */
    const selectedCell = createMemo((prev: Cell | null): Cell | null => {
        const allRows = rows();
        const allHeaders = headers();
        if (
            !parentFocus.hasFocus() ||
            pendingAppend() !== null ||
            allRows.length === 0 ||
            allHeaders.length === 0
        ) {
            return null;
        }
        const key = focus.activeChild();
        if (key === null) {
            return { row: allRows[0]!, header: allHeaders[0]! };
        }
        const { headerId, rowId } = parseCellKey(key);
        // If the selected row is gone, stay at the same position; if the
        // selected column is gone, move to the first one.
        const row =
            allRows.find((row) => row.id === rowId) ??
            allRows[Math.min(prev?.row.index ?? 0, allRows.length - 1)]!;
        const header = allHeaders.find((header) => header.id === headerId) ?? allHeaders[0]!;
        return { row, header };
    }, null);

    const isSelected = (cell: Cell): boolean => {
        const sel = selectedCell();
        return sel !== null && sel.row.id === cell.row.id && sel.header.id === cell.header.id;
    };

    const isEditing = (cell: Cell): boolean => {
        const state = edit();
        return (
            state !== null &&
            isSelected(cell) &&
            cell.row.id === state.rowId &&
            cell.header.id === state.headerId
        );
    };

    createEffect(() => {
        const state = edit();
        const sel = selectedCell();
        if (state && (!sel || sel.row.id !== state.rowId || sel.header.id !== state.headerId)) {
            setEdit(null);
        }
    });

    // Move the active child to the newly added row once it appears.
    createEffect(() => {
        const pending = pendingAppend();
        if (!pending) {
            return;
        }
        const newRow = rows().find((row) => !pending.previousRowIds.has(row.id));
        if (!newRow) {
            return;
        }
        setPendingAppend(null);
        const header = headers().find((header) => header.id === pending.headerId) ?? headers()[0];
        focus.setActiveChild(header ? makeCellKey(header.id, newRow.id) : null);
    });

    // Repoint the active child at the selected cell when its own cell no longer exists.
    createEffect(() => {
        const key = focus.activeChild();
        const sel = selectedCell();
        if (key === null || sel === null) {
            return;
        }
        const target = keyOf(sel);
        if (target !== key) {
            focus.setActiveChild(target);
        }
    });

    // Restore DOM focus after a deletion, which may have removed the focused cell.
    createEffect(() => {
        const pending = pendingDelete();
        if (!pending || rows().some((row) => row.id === pending.rowId)) {
            return;
        }
        setPendingDelete(null);
        if (rows().length === 0 || headers().length === 0) {
            return;
        }
        queueMicrotask(() => {
            parentFocus.setFocused(true);
            setFocusRequest((request) => request + 1);
        });
    });

    const select = (cell: Cell) => {
        setPendingAppend(null);
        setSuppressedFocus(null);
        focus.childFocus(keyOf(cell)).setFocused(true);
    };

    /** Add a row and select its cell in the given column once it appears. */
    const addRow = (headerId: string) => {
        setPendingAppend({
            headerId,
            previousRowIds: new Set(rows().map((row) => row.id)),
        });
        setSuppressedFocus(null);
        parentFocus.setFocused(true);
        props.onAddRow();
    };

    const moveSelection = (from: Cell, dir: MoveDirection) => {
        select(neighbor(from, dir) ?? from);
    };

    const cellText = (cell: Cell): string => fieldText(fieldOf(cell), cell.header);

    const issuesByPath = createMemo(() => {
        const index = new Map<string, string[]>();
        for (const issue of props.issues ?? []) {
            const key = pathKey(issue.path);
            const messages = index.get(key) ?? [];
            messages.push(issue.message);
            index.set(key, messages);
        }
        return index;
    });

    const tableIssueMessages = createMemo(() =>
        (props.issues ?? [])
            .filter((issue) => issue.issueType === "OrphanedTable")
            .map((issue) => issue.message),
    );

    const cellIssueMessages = (cell: Cell): string[] => {
        const field = fieldOf(cell);
        return field ? (issuesByPath().get(pathKey(field.content.path)) ?? []) : [];
    };

    const cellIsInvalid = (cell: Cell): boolean => {
        if (cellIssueMessages(cell).length > 0) {
            return true;
        }
        const header = cell.header;
        const field = fieldOf(cell);
        if (!field || field.tag === "Null" || header.type.tag === "Unknown") {
            return false;
        }
        if (header.type.tag === "RowRef") {
            const codomain = codomainOf(header);
            return (
                field.tag !== "RowRef" ||
                codomain?.label === null ||
                !codomain?.rows.some((row) => row.id === field.content.id)
            );
        }
        return field.tag !== header.type.tag;
    };

    const fieldText = (field: FieldValue | undefined, header: TableHeader): string => {
        if (!field || field.tag === "Null") {
            return "";
        }
        if (field.tag === "RowRef") {
            const codomain = codomainOf(header);
            const target = codomain?.rows.find((row) => row.id === field.content.id);
            if (codomain && target) {
                return defaultRowLabel(codomain, target);
            }
            for (const table of props.tables) {
                const mistypedTarget = table.rows.find((row) => row.id === field.content.id);
                if (mistypedTarget) {
                    return defaultRowLabel(table, mistypedTarget);
                }
            }
            return codomain ? `${tableDisplayName(codomain)} ?` : "?";
        }
        if (field.tag === "Bool") {
            return field.content.value ? "true" : "false";
        }
        return String(field.content.value);
    };

    /** Parse the text committed by a cell editor into a field value. */
    const parseValue = (
        header: TableHeader,
        text: string,
    ): { ok: true; value: LiteralValue | TableRow } | { ok: false } => {
        const trimmed = text.trim();
        if (trimmed === "") {
            return { ok: true, value: null };
        }
        switch (header.type.tag) {
            case "String":
                return { ok: true, value: text };
            case "Int": {
                const parsed = Number(trimmed);
                return Number.isInteger(parsed) ? { ok: true, value: parsed } : { ok: false };
            }
            case "Float": {
                const parsed = Number(trimmed);
                return Number.isFinite(parsed) ? { ok: true, value: parsed } : { ok: false };
            }
            case "Bool":
                return trimmed === "true" || trimmed === "false"
                    ? { ok: true, value: trimmed === "true" }
                    : { ok: false };
            case "RowRef": {
                const codomain = codomainOf(header);
                const target = codomain?.rows.find(
                    (row) => defaultRowLabel(codomain, row) === trimmed,
                );
                return target ? { ok: true, value: target } : { ok: false };
            }
            case "Unknown":
                return { ok: false };
        }
    };

    const validateText = (header: TableHeader, text: string): boolean =>
        parseValue(header, text).ok;

    const setField = (cell: Cell, value: LiteralValue | TableRow) => {
        props.onSetField(cell.row, cell.header, value);
    };

    const startEditing = (cell: Cell, text: string) => {
        if (!isEditable(cell)) {
            return;
        }
        select(cell);
        setEdit({ text, rowId: cell.row.id, headerId: cell.header.id });
    };

    const setEditText = (text: string) => setEdit((state) => (state ? { ...state, text } : state));

    /** Stop editing and move the selection, adding a row when moving below the last one.

    The edited cell is located by ID, since rows and columns may have shifted
    since editing began.
     */
    const finishEditing = (state: EditState, dir: MoveDirection) => {
        setEdit(null);
        if (dir === "stay") {
            return;
        }
        const cell = resolveCell(state.rowId, state.headerId);
        if (!cell) {
            return;
        }
        const next = neighbor(cell, dir);
        if (next) {
            select(next);
        } else if (dir === "down") {
            addRow(cell.header.id);
        } else if (dir === "forward") {
            addRow(headers()[0]!.id);
        } else {
            select(cell);
        }
    };

    /** Commit the text of a cell editor, writing to the cell by ID.

    The write is skipped if the row or column has since been removed.
     */
    const commitEdit = (state: EditState, dir: MoveDirection | "blur") => {
        const cell = resolveCell(state.rowId, state.headerId);
        if (cell) {
            const parsed = parseValue(cell.header, state.text);
            if (parsed.ok) {
                setField(cell, parsed.value);
            }
            // Otherwise, revert to the previous value.
        }
        if (dir === "blur") {
            // Focus has moved elsewhere; don't steal it back.
            setSuppressedFocus(makeCellKey(state.headerId, state.rowId));
            setEdit(null);
        } else {
            finishEditing(state, dir);
        }
    };

    /** Commit a row reference chosen from the completions dropdown. */
    const commitRowRef = (state: EditState, target: TableRow) => {
        const cell = resolveCell(state.rowId, state.headerId);
        if (cell) {
            setField(cell, target);
        }
        finishEditing(state, "stay");
    };

    const cancelEdit = () => {
        setEdit(null);
    };

    const toggleBool = (cell: Cell) => {
        const field = fieldOf(cell);
        const current = field?.tag === "Bool" ? field.content.value : false;
        setField(cell, !current);
    };

    const completionsFor = (cell: Cell): Completion[] | undefined => {
        if (cell.header.type.tag !== "RowRef") {
            return undefined;
        }
        const codomain = codomainOf(cell.header);
        if (!codomain) {
            return [];
        }
        const field = fieldOf(cell);
        const currentId = field?.tag === "RowRef" ? field.content.id : undefined;
        return codomain.rows.map((target) => ({
            name: defaultRowLabel(codomain, target),
            selected: target.id === currentId,
            onComplete: () => {
                const state = edit();
                if (state) {
                    commitRowRef(state, target);
                }
            },
        }));
    };

    const onCellKeyDown = (evt: KeyboardEvent, cell: Cell) => {
        // Ignore keystrokes handled by a cell editor, including those that
        // just closed it: the editor prevents default on keys it handles.
        if (edit() !== null || evt.defaultPrevented) {
            return;
        }
        const key = evt.key;
        if (key === "ArrowUp") {
            moveSelection(cell, "up");
        } else if (key === "ArrowDown") {
            moveSelection(cell, "down");
        } else if (key === "ArrowLeft") {
            moveSelection(cell, "left");
        } else if (key === "ArrowRight") {
            moveSelection(cell, "right");
        } else if (key === "Tab") {
            // At the boundary of the grid, let Tab move focus out of it.
            const dir = evt.shiftKey ? "backward" : "forward";
            const next = neighbor(cell, dir);
            if (!next) {
                return;
            }
            select(next);
        } else if (!isEditable(cell)) {
            return;
        } else if (key === "Enter" || key === "F2") {
            if (cell.header.type.tag === "Bool") {
                toggleBool(cell);
            } else {
                startEditing(cell, cellText(cell));
            }
        } else if (key === " " && cell.header.type.tag === "Bool") {
            toggleBool(cell);
        } else if (key === "Delete" || key === "Backspace") {
            setField(cell, null);
        } else if (isPrintableKey(evt) && cell.header.type.tag !== "Bool") {
            startEditing(cell, key);
        } else {
            return;
        }
        evt.preventDefault();
    };

    const deleteRow = (row: TableRow) => {
        // Only a focused table needs its focus restored after the row is removed.
        if (parentFocus.hasFocus()) {
            setPendingDelete({ rowId: row.id });
        }
        props.onDeleteRow(row);
    };

    return (
        <section
            class={`${styles.table}${props.class ? ` ${props.class}` : ""}`}
            classList={{ [styles.unknown]: props.table.label === null }}
            title={tableIssueMessages().join("\n") || undefined}
            onFocusOut={(evt) => {
                const section = evt.currentTarget;
                const next = evt.relatedTarget as Element | null;
                if (next && section.contains(next)) {
                    return;
                }
                // A focused element removed from the DOM, such as a cell editor
                // unmounted by a concurrent change, also fires `focusout`. Focus
                // is restored synchronously in that case, so check afterwards.
                queueMicrotask(() => {
                    if (!section.contains(document.activeElement)) {
                        // Batched so no cell sees itself selected but unsuppressed
                        // and grabs the focus back.
                        batch(() => {
                            setPendingAppend(null);
                            setSuppressedFocus(null);
                            parentFocus.setFocused(false);
                        });
                    }
                });
            }}
        >
            <div class={styles.header}>
                <h3 class={styles.label} classList={{ [styles.unnamed]: !props.table.label }}>
                    {tableDisplayName(props.table)}
                </h3>
            </div>
            <table class={styles.grid} role="grid">
                <colgroup>
                    <Show
                        when={headers().length > 0}
                        fallback={<col style={{ width: `${EMPTY_COLUMN_WIDTH}px` }} />}
                    >
                        <Index each={headers()}>
                            {(header) => (
                                <col style={{ width: `${COLUMN_WIDTHS[header().type.tag]}px` }} />
                            )}
                        </Index>
                    </Show>
                    <col style={{ width: `${DELETE_COLUMN_WIDTH}px` }} />
                </colgroup>
                <thead>
                    <tr>
                        <Show
                            when={headers().length > 0}
                            fallback={<th class={styles.columnHeader} scope="col" />}
                        >
                            <Index each={headers()}>
                                {(header) => (
                                    <th class={styles.columnHeader} scope="col">
                                        <Show
                                            when={header().label}
                                            fallback={
                                                <span class={styles.unnamed}>
                                                    {header().label === null
                                                        ? "Unknown column"
                                                        : "Unnamed column"}
                                                </span>
                                            }
                                        >
                                            {header().label}
                                        </Show>
                                    </th>
                                )}
                            </Index>
                        </Show>
                        <th class={styles.columnHeader} scope="col" />
                    </tr>
                </thead>
                <tbody>
                    <Index each={rows()}>
                        {(row) => (
                            <tr>
                                <Show
                                    when={headers().length > 0}
                                    fallback={<td class={styles.cell} role="gridcell" />}
                                >
                                    <Index each={headers()}>
                                        {(header) => {
                                            // The row and header at this slot change, so
                                            // resolve the cell lazily.
                                            const cell = (): Cell => ({
                                                row: row(),
                                                header: header(),
                                            });
                                            const cellFocus: FocusHandle = {
                                                hasFocus: () => isSelected(cell()),
                                                setFocused: (focused) =>
                                                    focus
                                                        .childFocus(keyOf(cell()))
                                                        .setFocused(focused),
                                            };
                                            let cellRef!: HTMLTableCellElement;

                                            createEffect(() => {
                                                focusRequest();
                                                if (
                                                    cellFocus.hasFocus() &&
                                                    !isEditing(cell()) &&
                                                    suppressedFocus() !== keyOf(cell()) &&
                                                    document.activeElement !== cellRef
                                                ) {
                                                    cellRef.focus();
                                                }
                                            });

                                            return (
                                                <td
                                                    ref={cellRef}
                                                    class={styles.cell}
                                                    role="gridcell"
                                                    classList={{
                                                        [styles.selected]: isSelected(cell()),
                                                        [styles.invalid]: cellIsInvalid(cell()),
                                                    }}
                                                    tabindex={
                                                        !isEditing(cell()) &&
                                                        (isSelected(cell()) ||
                                                            (!selectedCell() &&
                                                                isFirstCell(cell())))
                                                            ? 0
                                                            : -1
                                                    }
                                                    aria-selected={isSelected(cell())}
                                                    aria-invalid={cellIsInvalid(cell())}
                                                    title={
                                                        cellIssueMessages(cell()).join("\n") ||
                                                        undefined
                                                    }
                                                    onFocus={() => select(cell())}
                                                    onMouseDown={(evt) => {
                                                        // Focus explicitly: not all browsers
                                                        // focus a tabindex ancestor on click.
                                                        // Focus before selecting: focusing
                                                        // blurs, and thereby commits, any open
                                                        // cell editor, while selecting first
                                                        // would unmount it without a commit.
                                                        if (!isEditing(cell())) {
                                                            evt.currentTarget.focus();
                                                        }
                                                    }}
                                                    onDblClick={() => {
                                                        if (header().type.tag === "Bool") {
                                                            toggleBool(cell());
                                                        } else {
                                                            startEditing(cell(), cellText(cell()));
                                                        }
                                                    }}
                                                    onKeyDown={(evt) => onCellKeyDown(evt, cell())}
                                                >
                                                    <Show
                                                        when={isEditing(cell())}
                                                        fallback={
                                                            <CellContent
                                                                text={cellText(cell())}
                                                                isBool={
                                                                    header().type.tag === "Bool"
                                                                }
                                                                isRowRef={
                                                                    header().type.tag === "RowRef"
                                                                }
                                                                onOpenRowRef={() =>
                                                                    startEditing(
                                                                        cell(),
                                                                        cellText(cell()),
                                                                    )
                                                                }
                                                                onToggle={() => toggleBool(cell())}
                                                            />
                                                        }
                                                    >
                                                        <CellEditor
                                                            focus={cellFocus}
                                                            text={edit()?.text ?? ""}
                                                            setText={setEditText}
                                                            isRowRef={
                                                                header().type.tag === "RowRef"
                                                            }
                                                            validate={(text) =>
                                                                validateText(header(), text)
                                                            }
                                                            completions={completionsFor(cell())}
                                                            onCommit={(dir) => {
                                                                const state = edit();
                                                                if (state) {
                                                                    commitEdit(state, dir);
                                                                }
                                                            }}
                                                            onCancel={cancelEdit}
                                                            canExitBackward={!isFirstCell(cell())}
                                                        />
                                                    </Show>
                                                </td>
                                            );
                                        }}
                                    </Index>
                                </Show>
                                <td class={styles.deleteCell}>
                                    <button
                                        type="button"
                                        class={styles.deleteRow}
                                        title="Delete row"
                                        aria-label="Delete row"
                                        tabindex={-1}
                                        onMouseDown={(evt) => evt.preventDefault()}
                                        onClick={() => deleteRow(row())}
                                    >
                                        ×
                                    </button>
                                </td>
                            </tr>
                        )}
                    </Index>
                </tbody>
            </table>
            <Show when={props.table.label !== null}>
                <div class={styles.footer}>
                    <button
                        class={styles.addRow}
                        type="button"
                        onClick={() => addRow(headers()[0]?.id ?? "")}
                    >
                        + Row
                    </button>
                </div>
            </Show>
        </section>
    );
}

/** The read-only content of a cell that is not being edited.

Boolean cells toggle only when the checkbox itself is clicked; clicking
elsewhere in the cell just selects it. The native toggle is deliberately not
prevented: reverting it would fight with the reactively controlled `checked`
property, which instead confirms the toggle when the new value flows back in.
 */
function CellContent(props: {
    text: string;
    isBool: boolean;
    isRowRef: boolean;
    onOpenRowRef: () => void;
    onToggle: () => void;
}) {
    return (
        <Show
            when={props.isBool}
            fallback={
                <Show
                    when={props.isRowRef}
                    fallback={<span class={styles.cellText}>{props.text}</span>}
                >
                    <span class={styles.rowRefContent}>
                        <span class={styles.cellText}>{props.text}</span>
                        <button
                            type="button"
                            class={styles.rowRefIndicator}
                            aria-label="Choose a value"
                            tabindex={-1}
                            onMouseDown={(evt) => {
                                evt.preventDefault();
                                evt.stopPropagation();
                            }}
                            onClick={(evt) => {
                                evt.stopPropagation();
                                props.onOpenRowRef();
                            }}
                        >
                            <ChevronDown size={14} aria-hidden="true" />
                        </button>
                    </span>
                </Show>
            }
        >
            <input
                type="checkbox"
                class={styles.checkbox}
                checked={props.text === "true"}
                tabindex={-1}
                onClick={() => props.onToggle()}
            />
        </Show>
    );
}

/** Text editor for a single cell, active while the cell is in editing mode.

The text is owned by the parent so that it survives the editor being remounted
in a different cell slot when rows or columns shift under it.
 */
function CellEditor(props: {
    focus: FocusHandle;
    text: string;
    setText: (text: string) => void;
    isRowRef: boolean;
    validate: (text: string) => boolean;
    completions?: Completion[];
    onCommit: (dir: MoveDirection | "blur") => void;
    onCancel: () => void;
    canExitBackward: boolean;
}) {
    let finished = false;

    // An editor unmounted by a concurrent change must not commit from the
    // `blur` that removing its focused input fires.
    onCleanup(() => {
        finished = true;
    });

    /** Whether the input has gained focus since mounting.

    The focus directive in `TextInput` reports the focus state once on mount,
    which must not be mistaken for losing focus.
     */
    let hadFocus = false;

    const commit = (dir: MoveDirection | "blur") => {
        if (!finished) {
            finished = true;
            props.onCommit(dir);
        }
    };

    const input = (
        <TextInput
            class={styles.cellInput}
            classList={{ [styles.invalid]: !props.validate(props.text) }}
            text={props.text}
            setText={props.setText}
            focus={props.focus}
            completions={props.completions}
            filterCompletionsByText={!props.isRowRef}
            readOnly={props.isRowRef}
            exitUp={() => commit("up")}
            exitDown={() => commit("down")}
            exitForward={() => commit("forward")}
            exitBackward={props.canExitBackward ? () => commit("backward") : undefined}
            createBelow={() => commit("down")}
            onComplete={() => {
                // The row reference is committed by the completion itself.
                finished = true;
            }}
            interceptKeyDown={(evt) => {
                if (evt.key === "Escape") {
                    finished = true;
                    props.onCancel();
                    return true;
                }
                return false;
            }}
            hasFocused={() => {
                hadFocus = true;
            }}
            hasBlurred={() => {
                if (hadFocus) {
                    commit("blur");
                }
            }}
        />
    );

    return (
        <Show when={props.isRowRef} fallback={input}>
            <span class={styles.rowRefContent}>
                {input}
                <span class={styles.rowRefIndicator} aria-hidden="true">
                    <ChevronDown size={14} />
                </span>
            </span>
        </Show>
    );
}

function pathKey(path: ReadonlyArray<string>): string {
    return path.join("\u0000");
}

function makeCellKey(headerId: string, rowId: string): CellKey {
    return `${headerId}\u0000${rowId}`;
}

function parseCellKey(key: CellKey): { headerId: string; rowId: string } {
    const sep = key.indexOf("\u0000");
    return { headerId: key.slice(0, sep), rowId: key.slice(sep + 1) };
}

/** Default display label for a row referenced by a `RowRef` cell. */
function defaultRowLabel(table: InstanceTable, row: TableRow): string {
    const tableName = tableDisplayName(table);
    if (table.headers.length === 0) {
        return `${tableName} row ${row.index + 1}`;
    }
    const first = row.fields[0];
    const value = first?.tag === "String" ? first.content.value : "";
    if (value === "") {
        return `${tableName} row ${row.index + 1}`;
    }
    return `${tableName} "${value}"`;
}

function tableDisplayName(table: InstanceTable): string {
    return table.label === null ? "Unknown table" : table.label || "Unnamed table";
}

/** Whether a keystroke should start editing by replacing the cell content. */
function isPrintableKey(evt: KeyboardEvent): boolean {
    return evt.key.length === 1 && !evt.ctrlKey && !evt.metaKey && !evt.altKey;
}
