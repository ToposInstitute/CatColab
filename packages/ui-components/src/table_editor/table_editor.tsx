import ChevronDown from "lucide-solid/icons/chevron-down";
import { createEffect, createMemo, createSignal, Index, Show } from "solid-js";

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

/** Position of a cell in the grid, by zero-based row and column index. */
type CellPosition = { row: number; col: number };

type CellKey = `${number}:${number}`;

type EditState = { rowId: string; headerId: string; text: string };

type PendingAppend = { col: number; previousRowIds: ReadonlySet<string> };

type PendingDelete = { rowId: string; row: number; col: number };

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
    focus?: FocusHandle;

    /** Called when the user edits a cell.

    A `TableRow` value sets a row reference; `null` clears the field.
     */
    onSetField: (row: TableRow, header: TableHeader, value: LiteralValue | TableRow) => void;

    /** Called when the user adds a row. */
    onAddRow: () => void;

    /** Called when the user deletes a row. */
    onDeleteRow: (row: TableRow) => void;

    /** Called when the user hides the table. Shows a hide button if provided. */
    onHide?: () => void;
};

/** A spreadsheet-like editor for a tabular data instance.
 */
export function TableEditor(props: TableEditorProps) {
    const [hasLocalFocus, setHasLocalFocus] = createSignal(false);
    const [edit, setEdit] = createSignal<EditState | null>(null);
    const [pendingAppend, setPendingAppend] = createSignal<PendingAppend | null>(null);
    const [pendingDelete, setPendingDelete] = createSignal<PendingDelete | null>(null);
    const [suppressedFocus, setSuppressedFocus] = createSignal<CellKey | null>(null);
    const [focusRequest, setFocusRequest] = createSignal(0);

    const parentFocus: FocusHandle = {
        hasFocus: () => props.focus?.hasFocus() ?? hasLocalFocus(),
        setFocused: (focused) => {
            if (props.focus) {
                props.focus.setFocused(focused);
            } else {
                setHasLocalFocus(focused);
            }
        },
    };
    const focus = useChildFocus<CellKey>(parentFocus, { default: cellKey({ row: 0, col: 0 }) });

    const rows = () => props.table.rows;
    const headers = () => props.table.headers;

    const isEditable = (pos: CellPosition) => headers()[pos.col]?.type.tag !== "Unknown";

    /** The table referenced by a `RowRef` column, if it can be resolved. */
    const codomainOf = (header: TableHeader): InstanceTable | undefined => {
        const type = header.type;
        if (type.tag !== "RowRef") {
            return undefined;
        }
        return props.tables.find((table) => table.id === type.content.id);
    };

    /** Selection clamped to the current bounds of the grid. */
    const clampedSelection = createMemo((): CellPosition | null => {
        const key = focus.activeChild();
        if (!parentFocus.hasFocus() || !key || rows().length === 0 || headers().length === 0) {
            return null;
        }
        const sel = positionFromCellKey(key);
        return {
            row: Math.min(sel.row, rows().length - 1),
            col: Math.min(sel.col, headers().length - 1),
        };
    });

    const isSelected = (pos: CellPosition): boolean => {
        const sel = clampedSelection();
        return sel !== null && sel.row === pos.row && sel.col === pos.col;
    };

    const isEditing = (pos: CellPosition): boolean => {
        const state = edit();
        if (!state) {
            return false;
        }
        return (
            isSelected(pos) &&
            rows()[pos.row]?.id === state.rowId &&
            headers()[pos.col]?.id === state.headerId
        );
    };

    createEffect(() => {
        const state = edit();
        const sel = clampedSelection();
        if (
            state &&
            (!sel ||
                rows()[sel.row]?.id !== state.rowId ||
                headers()[sel.col]?.id !== state.headerId)
        ) {
            setEdit(null);
        }
    });

    createEffect(() => {
        const key = focus.activeChild();
        if (!key) {
            setPendingAppend(null);
            return;
        }

        const pending = pendingAppend();
        if (pending) {
            const newRow = rows().findIndex((row) => !pending.previousRowIds.has(row.id));
            if (newRow < 0) {
                return;
            }
            const target = cellKey({
                row: newRow,
                col: Math.max(0, Math.min(pending.col, headers().length - 1)),
            });
            setPendingAppend(null);
            focus.setActiveChild(target);
            return;
        }

        const pos = positionFromCellKey(key);
        const inBounds =
            pos.row >= 0 && pos.row < rows().length && pos.col >= 0 && pos.col < headers().length;
        if (inBounds) {
            return;
        }

        if (rows().length === 0 || headers().length === 0) {
            focus.setActiveChild(cellKey({ row: 0, col: 0 }));
        } else {
            focus.setActiveChild(cellKey(clampPosition(pos)));
        }
    });

    createEffect(() => {
        const pending = pendingDelete();
        if (!pending || rows().some((row) => row.id === pending.rowId)) {
            return;
        }
        setPendingDelete(null);
        if (rows().length === 0 || headers().length === 0) {
            return;
        }
        const target = cellKey(clampPosition({ row: pending.row, col: pending.col }));
        queueMicrotask(() => {
            parentFocus.setFocused(true);
            focus.setActiveChild(target);
            setFocusRequest((request) => request + 1);
        });
    });

    const select = (pos: CellPosition) => {
        const key = cellKey(pos);
        setPendingAppend(null);
        setSuppressedFocus(null);
        focus.childFocus(key).setFocused(true);
    };

    const selectPendingAppend = (pos: CellPosition) => {
        setPendingAppend({
            col: pos.col,
            previousRowIds: new Set(rows().map((row) => row.id)),
        });
        setSuppressedFocus(null);
        focus.childFocus(cellKey(pos)).setFocused(true);
    };

    const moveSelection = (from: CellPosition, dir: MoveDirection) => {
        if (dir === "forward" || dir === "backward") {
            const step = dir === "forward" ? 1 : -1;
            let { row, col } = from;
            col += step;
            // Wrap to the adjacent row at the ends of a row.
            if (col >= headers().length && row < rows().length - 1) {
                row += 1;
                col = 0;
            } else if (col < 0 && row > 0) {
                row -= 1;
                col = headers().length - 1;
            }
            select(clampPosition({ row, col }));
            return;
        }
        const next = { ...from };
        if (dir === "up") {
            next.row -= 1;
        } else if (dir === "down") {
            next.row += 1;
        } else if (dir === "left") {
            next.col -= 1;
        } else if (dir === "right") {
            next.col += 1;
        }
        select(clampPosition(next));
    };

    const clampPosition = (pos: CellPosition): CellPosition => ({
        row: Math.max(0, Math.min(pos.row, rows().length - 1)),
        col: Math.max(0, Math.min(pos.col, headers().length - 1)),
    });

    const cellText = (pos: CellPosition): string => {
        const header = headers()[pos.col];
        const field = rows()[pos.row]?.fields[pos.col];
        return header ? fieldText(field, header) : "";
    };

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

    const cellIssueMessages = (pos: CellPosition): string[] => {
        const field = rows()[pos.row]?.fields[pos.col];
        return field ? (issuesByPath().get(pathKey(field.content.path)) ?? []) : [];
    };

    const cellIsInvalid = (pos: CellPosition): boolean => {
        if (cellIssueMessages(pos).length > 0) {
            return true;
        }
        const header = headers()[pos.col];
        const field = rows()[pos.row]?.fields[pos.col];
        if (!header || !field || field.tag === "Null" || header.type.tag === "Unknown") {
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

    const setField = (pos: CellPosition, value: LiteralValue | TableRow) => {
        const row = rows()[pos.row];
        const header = headers()[pos.col];
        if (row && header) {
            props.onSetField(row, header, value);
        }
    };

    const startEditing = (pos: CellPosition, text: string) => {
        if (!isEditable(pos)) {
            return;
        }
        select(pos);
        setEdit({ text, rowId: rows()[pos.row]!.id, headerId: headers()[pos.col]!.id });
    };

    /** Stop editing and move the selection, adding a row when moving below the last one. */
    const finishEditing = (pos: CellPosition, dir: MoveDirection) => {
        setEdit(null);
        if (dir === "stay") {
            return;
        }
        if (
            (dir === "down" || (dir === "forward" && pos.col === headers().length - 1)) &&
            pos.row === rows().length - 1
        ) {
            const target = { row: pos.row + 1, col: dir === "down" ? pos.col : 0 };
            selectPendingAppend(target);
            props.onAddRow();
        } else {
            moveSelection(pos, dir);
        }
    };

    const commitEdit = (pos: CellPosition, text: string, dir: MoveDirection | "blur") => {
        const header = headers()[pos.col];
        if (header) {
            const parsed = parseValue(header, text);
            if (parsed.ok) {
                setField(pos, parsed.value);
            }
            // Otherwise, revert to the previous value.
        }
        if (dir === "blur") {
            // Focus has moved elsewhere; don't steal it back.
            setSuppressedFocus(cellKey(pos));
            setEdit(null);
        } else {
            finishEditing(pos, dir);
        }
    };

    /** Commit a row reference chosen from the completions dropdown. */
    const commitRowRef = (pos: CellPosition, target: TableRow) => {
        setField(pos, target);
        finishEditing(pos, "stay");
    };

    const cancelEdit = () => {
        setEdit(null);
    };

    const toggleBool = (pos: CellPosition) => {
        const field = rows()[pos.row]?.fields[pos.col];
        const current = field?.tag === "Bool" ? field.content.value : false;
        setField(pos, !current);
    };

    const completionsFor = (pos: CellPosition, header: TableHeader): Completion[] | undefined => {
        if (header.type.tag !== "RowRef") {
            return undefined;
        }
        const codomain = codomainOf(header);
        if (!codomain) {
            return [];
        }
        return codomain.rows.map((target) => ({
            name: defaultRowLabel(codomain, target),
            onComplete: () => commitRowRef(pos, target),
        }));
    };

    const onCellKeyDown = (evt: KeyboardEvent, pos: CellPosition) => {
        // Ignore keystrokes handled by a cell editor, including those that
        // just closed it: the editor prevents default on keys it handles.
        if (edit() !== null || evt.defaultPrevented) {
            return;
        }
        const header = headers()[pos.col];
        if (!header) {
            return;
        }
        const key = evt.key;
        if (key === "ArrowUp") {
            moveSelection(pos, "up");
        } else if (key === "ArrowDown") {
            moveSelection(pos, "down");
        } else if (key === "ArrowLeft") {
            moveSelection(pos, "left");
        } else if (key === "ArrowRight") {
            moveSelection(pos, "right");
        } else if (key === "Tab") {
            // At the boundary of the grid, let Tab move focus out of it.
            const atBoundary = evt.shiftKey
                ? pos.row === 0 && pos.col === 0
                : pos.row === rows().length - 1 && pos.col === headers().length - 1;
            if (atBoundary) {
                return;
            }
            moveSelection(pos, evt.shiftKey ? "backward" : "forward");
        } else if (!isEditable(pos)) {
            return;
        } else if (key === "Enter" || key === "F2") {
            if (header.type.tag === "Bool") {
                toggleBool(pos);
            } else {
                startEditing(pos, cellText(pos));
            }
        } else if (key === " " && header.type.tag === "Bool") {
            toggleBool(pos);
        } else if (key === "Delete" || key === "Backspace") {
            setField(pos, null);
        } else if (isPrintableKey(evt) && header.type.tag !== "Bool") {
            startEditing(pos, key);
        } else {
            return;
        }
        evt.preventDefault();
    };

    const deleteRow = (index: number) => {
        const row = rows()[index];
        if (row) {
            setPendingDelete({ rowId: row.id, row: index, col: clampedSelection()?.col ?? 0 });
            props.onDeleteRow(row);
        }
    };

    return (
        <section
            class={`${styles.table}${props.class ? ` ${props.class}` : ""}`}
            classList={{ [styles.unknown]: props.table.label === null }}
            title={tableIssueMessages().join("\n") || undefined}
            onFocusOut={(evt) => {
                const next = evt.relatedTarget as Element | null;
                if (!next || !evt.currentTarget.contains(next)) {
                    setPendingAppend(null);
                    setSuppressedFocus(null);
                    parentFocus.setFocused(false);
                }
            }}
        >
            <div class={styles.header}>
                <Show when={props.onHide}>
                    {(onHide) => (
                        <button
                            type="button"
                            class={styles.hideTable}
                            aria-label="Hide table"
                            title="Hide table"
                            onClick={() => onHide()()}
                        >
                            &minus;
                        </button>
                    )}
                </Show>
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
                        {(_, rowIndex) => (
                            <tr>
                                <Show
                                    when={headers().length > 0}
                                    fallback={<td class={styles.cell} role="gridcell" />}
                                >
                                    <Index each={headers()}>
                                        {(header, colIndex) => {
                                            const pos = { row: rowIndex, col: colIndex };
                                            const cellFocus = focus.childFocus(cellKey(pos));
                                            const isFirstCell = rowIndex === 0 && colIndex === 0;
                                            let cellRef!: HTMLTableCellElement;

                                            createEffect(() => {
                                                focusRequest();
                                                if (
                                                    cellFocus.hasFocus() &&
                                                    !isEditing(pos) &&
                                                    suppressedFocus() !== cellKey(pos) &&
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
                                                        [styles.selected]: isSelected(pos),
                                                        [styles.invalid]: cellIsInvalid(pos),
                                                    }}
                                                    tabindex={
                                                        !isEditing(pos) &&
                                                        (isSelected(pos) ||
                                                            (!clampedSelection() &&
                                                                rowIndex === 0 &&
                                                                colIndex === 0))
                                                            ? 0
                                                            : -1
                                                    }
                                                    aria-selected={isSelected(pos)}
                                                    aria-invalid={cellIsInvalid(pos)}
                                                    title={
                                                        cellIssueMessages(pos).join("\n") ||
                                                        undefined
                                                    }
                                                    onFocus={() => select(pos)}
                                                    onMouseDown={(evt) => {
                                                        // Focus explicitly: not all browsers
                                                        // focus a tabindex ancestor on click.
                                                        // Focus before selecting: focusing
                                                        // blurs, and thereby commits, any open
                                                        // cell editor, while selecting first
                                                        // would unmount it without a commit.
                                                        if (!isEditing(pos)) {
                                                            evt.currentTarget.focus();
                                                        }
                                                    }}
                                                    onDblClick={() => {
                                                        if (header().type.tag === "Bool") {
                                                            toggleBool(pos);
                                                        } else {
                                                            startEditing(pos, cellText(pos));
                                                        }
                                                    }}
                                                    onKeyDown={(evt) => onCellKeyDown(evt, pos)}
                                                >
                                                    <Show
                                                        when={isEditing(pos)}
                                                        fallback={
                                                            <CellContent
                                                                text={cellText(pos)}
                                                                isBool={
                                                                    header().type.tag === "Bool"
                                                                }
                                                                isRowRef={
                                                                    header().type.tag === "RowRef"
                                                                }
                                                                onOpenRowRef={() =>
                                                                    startEditing(pos, cellText(pos))
                                                                }
                                                                onToggle={() => toggleBool(pos)}
                                                            />
                                                        }
                                                    >
                                                        <CellEditor
                                                            focus={cellFocus}
                                                            initialText={edit()?.text ?? ""}
                                                            isRowRef={
                                                                header().type.tag === "RowRef"
                                                            }
                                                            validate={(text) =>
                                                                validateText(header(), text)
                                                            }
                                                            completions={completionsFor(
                                                                pos,
                                                                header(),
                                                            )}
                                                            onCommit={(text, dir) =>
                                                                commitEdit(pos, text, dir)
                                                            }
                                                            onCancel={cancelEdit}
                                                            canExitBackward={!isFirstCell}
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
                                        onClick={() => deleteRow(rowIndex)}
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
                    <button class={styles.addRow} type="button" onClick={() => props.onAddRow()}>
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

/** Text editor for a single cell, active while the cell is in editing mode. */
function CellEditor(props: {
    focus: FocusHandle;
    initialText: string;
    isRowRef: boolean;
    validate: (text: string) => boolean;
    completions?: Completion[];
    onCommit: (text: string, dir: MoveDirection | "blur") => void;
    onCancel: () => void;
    canExitBackward: boolean;
}) {
    // The initial text is intentionally captured on mount.
    const [text, setText] = createSignal(props.initialText);

    let finished = false;

    /** Whether the input has gained focus since mounting.

    The focus directive in `TextInput` reports the focus state once on mount,
    which must not be mistaken for losing focus.
     */
    let hadFocus = false;

    const commit = (dir: MoveDirection | "blur") => {
        if (!finished) {
            finished = true;
            props.onCommit(text(), dir);
        }
    };

    const input = (
        <TextInput
            class={styles.cellInput}
            classList={{ [styles.invalid]: !props.validate(text()) }}
            text={text()}
            setText={setText}
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

function cellKey(pos: CellPosition): CellKey {
    return `${pos.row}:${pos.col}`;
}

function pathKey(path: ReadonlyArray<string>): string {
    return path.join("\u0000");
}

function positionFromCellKey(key: CellKey): CellPosition {
    const [row, col] = key.split(":");
    return { row: Number(row), col: Number(col) };
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
