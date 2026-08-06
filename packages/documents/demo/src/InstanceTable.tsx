import { Attr, Mapping } from "catcolab-logics/simple-schema";
import jspreadsheet from "jspreadsheet-ce";
import ChevronRight from "lucide-solid/icons/chevron-right";
import GripVertical from "lucide-solid/icons/grip-vertical";
import Minus from "lucide-solid/icons/minus";
import { createEffect, on, onCleanup, Show } from "solid-js";

import type { MorphismCell, ObjectCell, Row } from "catcolab-documents";
import type { DemoDocument } from "./document";
import { type Column, rowLabel, schemaShapeSignature } from "./instance-model";
import { moveItem } from "./table-layout";

import "jspreadsheet-ce/dist/jspreadsheet.css";
import "jspreadsheet-ce/dist/jspreadsheet.themes.css";
import "jsuites/dist/jsuites.css";
import styles from "./InstanceTable.module.css";

/**
 * jspreadsheet hardcodes a native `confirm("Are you sure to delete the selected
 * rows?")` before deleting rows (on Delete/Backspace or via its context menu),
 * with no option to disable it. Deleting a row here is cheap and undoable
 * through the history sidebar, so the prompt is just friction. Patch `confirm`
 * once to auto-accept exactly jspreadsheet's row/column delete prompts, leaving
 * every other `confirm()` (e.g. "Reset all data") untouched.
 */
function suppressJspreadsheetDeleteConfirm() {
    const w = window as Window & { __jssDeleteConfirmPatched?: boolean };
    if (w.__jssDeleteConfirmPatched) {
        return;
    }
    w.__jssDeleteConfirmPatched = true;
    const original = window.confirm.bind(window);
    window.confirm = (message?: string) => {
        if (
            typeof message === "string" &&
            /^Are you sure to delete the selected (rows|columns)\?$/.test(message)
        ) {
            return true;
        }
        return original(message);
    };
}

suppressJspreadsheetDeleteConfirm();

/**
 * The special dropdown value used for a foreign-key cell whose target row no
 * longer belongs to the mapping's current codomain (e.g. after the codomain was
 * changed). It is not among the dropdown's sources, so jspreadsheet renders it
 * verbatim and we style it as invalid.
 */
const INVALID = "invalid";
const columnDragDataKey = "application/x-catcolab-column";

/**
 * A maximal run of consecutive hidden columns. It renders as one narrow stub
 * column in the run's order position, whose header carries a right-pointing
 * chevron with the run's size; clicking it expands the whole run at once.
 */
type CollapsedGroup = { kind: "collapsed"; ids: string[] };

/** What one grid column stands for: a schema column, or a collapsed run. */
type GridColumn = Column | CollapsedGroup;

const isCollapsed = (entry: GridColumn): entry is CollapsedGroup => entry.kind === "collapsed";

/** A small inline lucide chevron, for buttons created outside Solid rendering. */
const chevronSvg = (direction: "left" | "right") =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${direction === "left" ? "m15 18-6-6 6-6" : "m9 18 6-6-6-6"}"/></svg>`;

const suppressHeaderClick = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
};

/** Clone one rendered worksheet column for the browser's native drag image. */
function columnDragPreview(header: HTMLTableCellElement, columnIndex: number): HTMLDivElement {
    const table = header.closest("table");
    const preview = document.createElement("div");
    preview.className = styles.columnDragPreview ?? "";
    if (!table) {
        preview.textContent = header.textContent;
        return preview;
    }

    const clone = table.cloneNode(true) as HTMLTableElement;
    clone.querySelector("colgroup")?.remove();
    for (const row of clone.querySelectorAll("tr")) {
        for (let index = row.cells.length - 1; index >= 0; index -= 1) {
            const cell = row.cells.item(index);
            if (cell && cell.dataset.x !== String(columnIndex)) {
                cell.remove();
            }
        }
    }
    if (styles.columnDragHandle) {
        for (const handle of clone.querySelectorAll(`.${styles.columnDragHandle}`)) {
            handle.remove();
        }
    }
    clone.style.width = `${header.getBoundingClientRect().width}px`;
    preview.append(clone);
    preview.style.height = `${table.getBoundingClientRect().height}px`;
    return preview;
}

/**
 * The label for a codomain row in a foreign-key dropdown: the compact form shown
 * both in the option and in the *closed* cell once selected. It is the entity
 * name followed by the row's first column value in quotes, e.g. `Person "Fred"`.
 * It falls back to the entity name and the row's 1-based index, e.g. `Person 1`,
 * when the first column is not a literal attribute (e.g. it is a mapping) or its
 * value is empty — including when the entity has no columns at all.
 */
/**
 * One entity's instance table, backed by a jspreadsheet worksheet.
 *
 * The instance is the source of truth: jspreadsheet is a view over it. Because
 * a schema *shape* change (columns added/removed, a mapping's codomain changed)
 * requires rebuilding the grid's columns, the whole jspreadsheet instance is
 * destroyed and recreated whenever the shape signature changes. Row edits made
 * in the grid are written straight back to the instance; those instance
 * mutations bump the document signals, but we guard against rebuilding on our
 * own edits by only rebuilding when the shape signature or row set changes.
 */
export function InstanceTable(props: {
    doc: DemoDocument;
    entity: ObjectCell;
    allColumns: Column[];
    hiddenColumns: string[];
    layoutControls?: boolean;
    /** Whether the table is collapsed down to just its header. */
    collapsed?: boolean;
    dragHandleRef: (element: HTMLButtonElement) => void;
    onColumnOrderChange: (visibleOrder: string[]) => void;
    onColumnsVisibleChange: (ids: string[], visible: boolean) => void;
    onCollapsedChange?: (collapsed: boolean) => void;
    /** A referenced row to reveal and highlight in this table. */
    highlightedRowId?: string;
    /** Changes for repeated navigation to the same row. */
    highlightRequest?: number;
    onHighlightDismiss?: () => void;
    onForeignKeyNavigate?: (tableId: string, rowId: string) => void;
}) {
    const doc = () => props.doc;
    // jspreadsheet mutates the host element (adding a `.spreadsheet` property),
    // so it is typed as its own element type; a div satisfies it at runtime.
    let container!: HTMLDivElement;
    const host = () => container as unknown as Parameters<typeof jspreadsheet.destroy>[0];
    // The current jspreadsheet worksheet instance, and the row ids backing it
    // (row index -> instance Row id), kept so grid callbacks can find the row.
    let worksheet: jspreadsheet.WorksheetInstance | undefined;
    let headerControlsCleanup: (() => void) | undefined;
    let rowIds: string[] = [];

    /** This entity's instance row with the given id, if it still exists. */
    const rowById = (id: string | undefined): Row | undefined =>
        id
            ? doc()
                  .instance.rowsOf(props.entity)
                  .find((r) => r.id === id)
            : undefined;

    /** The schema morphism cell (Attr or Mapping) a column stands for. */
    const morphismCellFor = (column: Column): MorphismCell => {
        const all = [...doc().schema.cellsOf(Mapping), ...doc().schema.cellsOf(Attr)];
        const cell = all.find((c) => c.id === column.morphismId);
        if (!cell) {
            throw new Error(`No schema morphism cell for column "${column.title}".`);
        }
        return cell;
    };

    /** The grid cell value shown for one row/column. */
    const cellValue = (row: Row, column: Column): jspreadsheet.CellValue => {
        // Look up by the column's morphism UUID, not its name: two morphisms can
        // share a name, so a name-keyed lookup would read the wrong column.
        const value = row.get({ id: column.morphismId });
        if (value === undefined) {
            return "";
        }
        if (column.kind === "attr") {
            return typeof value === "object" ? "" : value;
        }
        // A mapping: the value is the target Row. If that row is no longer a row
        // of the mapping's current codomain, it is invalid (e.g. the codomain
        // was changed out from under it).
        const target = value as Row;
        const codomainRows = doc().instance.rowsOf(column.codomain);
        return codomainRows.some((r) => r.id === target.id) ? target.id : INVALID;
    };

    /**
     * The grid's columns: the schema columns in layout order, with each maximal
     * run of consecutive hidden columns replaced by one collapsed stub in the
     * run's position.
     */
    const buildGridColumns = (): GridColumn[] => {
        const hidden = new Set(props.hiddenColumns);
        const result: GridColumn[] = [];
        for (const column of props.allColumns) {
            if (!hidden.has(column.morphismId)) {
                result.push(column);
                continue;
            }
            const last = result.at(-1);
            if (last && isCollapsed(last)) {
                last.ids.push(column.morphismId);
            } else {
                result.push({ kind: "collapsed", ids: [column.morphismId] });
            }
        }
        return result;
    };

    /** Build the jspreadsheet column configs for the current columns. */
    const buildColumns = (columns: GridColumn[]): jspreadsheet.Column[] => {
        if (columns.length === 0) {
            // An entity with no attributes/mappings has nothing to show per row;
            // render a single blank, read-only column (jspreadsheet needs at
            // least one) with no title, rather than a hint or its default "A".
            return [
                {
                    type: "text",
                    title: " ",
                    width: 120,
                    readOnly: true,
                },
            ];
        }
        return columns.map((column) => {
            if (isCollapsed(column)) {
                // The stub for a collapsed run: narrow, blank, and inert.
                return {
                    type: "text",
                    title: " ",
                    width: 36,
                    readOnly: true,
                };
            }
            if (column.kind === "attr") {
                if (column.attrType === "Boolean") {
                    return {
                        type: "checkbox",
                        title: column.title,
                        width: 180,
                    };
                }
                return {
                    type:
                        column.attrType === "Integer" || column.attrType === "Float"
                            ? "numeric"
                            : "text",
                    title: column.title,
                    width: 180,
                };
            }
            const codomainRows = doc().instance.rowsOf(column.codomain);
            const renderMapping = (
                cell: HTMLTableCellElement,
                value: jspreadsheet.CellValue | undefined,
            ) => {
                markInvalid(cell, value);
                const existing = cell.querySelector<HTMLButtonElement>(
                    "[data-foreign-key-navigate]",
                );
                if (value === INVALID || value === undefined || value === "") {
                    existing?.remove();
                    cell.classList.remove(styles.mappingCell ?? "");
                    return;
                }

                cell.classList.add(styles.mappingCell ?? "");
                existing?.remove();
                const button = document.createElement("button");
                button.type = "button";
                button.className = styles.foreignKeyButton ?? "";
                button.dataset.foreignKeyNavigate = "";
                button.innerHTML = chevronSvg("right");
                const target = codomainRows.find((row) => row.id === String(value));
                const label = target
                    ? rowLabel(doc(), column.codomain, target)
                    : column.codomain.label || "referenced row";
                button.title = `Go to ${label}`;
                button.setAttribute("aria-label", `Go to ${label}`);
                button.addEventListener("pointerdown", (event) => event.stopPropagation());
                button.addEventListener("mousedown", (event) => event.stopPropagation());
                button.addEventListener("click", (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    props.onForeignKeyNavigate?.(column.codomain.id, String(value));
                });
                cell.append(button);
            };
            return {
                type: "dropdown",
                title: column.title,
                width: 220,
                autocomplete: true,
                source: codomainRows.map((r) => ({
                    id: r.id,
                    name: rowLabel(doc(), column.codomain, r),
                })),
                render: renderMapping,
            };
        });
    };

    const rows = () => (doc().trackInstance(), doc().instance.rowsOf(props.entity));
    const hasRows = () => rows().length > 0;

    /** Build the 2-D data array (and refresh `rowIds`) from the instance. */
    const buildData = (columns: GridColumn[]): jspreadsheet.CellValue[][] => {
        const entityRows = rows();
        rowIds = entityRows.map((r) => r.id);
        if (columns.length === 0) {
            // One empty cell per row, matching the single hint column above.
            return entityRows.map(() => [""]);
        }
        return entityRows.map((row) =>
            columns.map((column) => (isCollapsed(column) ? "" : cellValue(row, column))),
        );
    };

    /** Push a single grid edit back into the instance. */
    const applyEdit = (
        columns: GridColumn[],
        x: number,
        y: number,
        value: jspreadsheet.CellValue,
    ) => {
        const column = columns[x];
        if (!column || isCollapsed(column)) {
            return;
        }
        const row = rowById(rowIds[y]);
        if (!row) {
            return;
        }
        const morphism = morphismCellFor(column);
        if (column.kind === "attr") {
            if (value === "") {
                row.set(morphism, undefined);
                return;
            }
            switch (column.attrType) {
                case "Boolean":
                    row.set(morphism, value === true || value === "true");
                    break;
                case "Integer": {
                    const number = Number(value);
                    if (
                        Number.isInteger(number) &&
                        number >= -2_147_483_648 &&
                        number <= 2_147_483_647
                    ) {
                        row.set(morphism, number);
                    }
                    break;
                }
                case "Float": {
                    const number = Number(value);
                    if (Number.isFinite(number) && Number.isFinite(Math.fround(number))) {
                        row.set(morphism, number);
                    }
                    break;
                }
                case "String":
                    row.set(morphism, String(value));
                    break;
            }
        } else {
            const target = doc()
                .instance.rowsOf(column.codomain)
                .find((r) => r.id === String(value));
            row.set(morphism, target);
        }
    };

    /** Colour foreign-key cells whose value is the INVALID sentinel. */
    const markInvalid = (cell: HTMLTableCellElement, value: jspreadsheet.CellValue | undefined) => {
        if (value === INVALID) {
            cell.classList.add(styles.invalidCell ?? "");
            cell.textContent = "⚠ invalid ref";
        } else {
            cell.classList.remove(styles.invalidCell ?? "");
        }
    };

    /**
     * Add layout controls to jspreadsheet's generated header cells: a collapse
     * chevron on every visible column, an expand chevron (with the run's size)
     * on every collapsed stub, and drag-and-drop reordering handles.
     */
    const installHeaderControls = (columns: GridColumn[]) => {
        headerControlsCleanup?.();
        headerControlsCleanup = undefined;
        if (columns.length === 0) {
            return;
        }

        const headers = [
            ...container.querySelectorAll<HTMLTableCellElement>(
                "table.jss_worksheet thead td[data-x]",
            ),
        ];
        const indicatorClasses = [
            styles.columnDragSource,
            styles.columnDropBefore,
            styles.columnDropAfter,
        ].filter((name): name is string => Boolean(name));
        const clearIndicators = () => {
            for (const header of headers) {
                header.classList.remove(...indicatorClasses);
            }
        };
        // The persisted order is patched through the *visible* ids only; the
        // parent merges them back around the hidden ones.
        const visibleIds = columns.flatMap((entry) =>
            isCollapsed(entry) ? [] : [entry.morphismId],
        );
        let draggedColumnId: string | undefined;
        const cleanups: Array<() => void> = [];

        for (const [index, header] of headers.entries()) {
            const entry = columns[index];
            if (!entry) {
                continue;
            }
            if (isCollapsed(entry)) {
                if (styles.collapsedHeader) {
                    header.classList.add(styles.collapsedHeader);
                }
                const label = `Expand ${entry.ids.length} collapsed column${
                    entry.ids.length === 1 ? "" : "s"
                }`;
                const expand = document.createElement("button");
                expand.type = "button";
                expand.className = styles.expandHandle ?? "";
                expand.title = label;
                expand.setAttribute("aria-label", label);
                expand.innerHTML = chevronSvg("right");
                const count = document.createElement("span");
                count.textContent = String(entry.ids.length);
                expand.append(count);
                const onExpand = (event: MouseEvent) => {
                    event.preventDefault();
                    event.stopPropagation();
                    props.onColumnsVisibleChange(entry.ids, true);
                };
                expand.addEventListener("click", onExpand);
                // The stub is not a real column: never sort rows by it.
                header.addEventListener("click", suppressHeaderClick);
                header.append(expand);
                cleanups.push(() => {
                    expand.removeEventListener("click", onExpand);
                    header.removeEventListener("click", suppressHeaderClick);
                });
                continue;
            }

            const column = entry;
            const collapse = document.createElement("button");
            collapse.type = "button";
            collapse.className = styles.collapseHandle ?? "";
            collapse.title = "Collapse column";
            collapse.setAttribute("aria-label", `Collapse ${column.title}`);
            collapse.innerHTML = chevronSvg("left");
            const onCollapse = (event: MouseEvent) => {
                event.preventDefault();
                event.stopPropagation();
                props.onColumnsVisibleChange([column.morphismId], false);
            };
            collapse.addEventListener("click", onCollapse);
            header.append(collapse);
            cleanups.push(() => collapse.removeEventListener("click", onCollapse));

            // Reordering needs at least two visible columns.
            if (visibleIds.length < 2) {
                continue;
            }
            const handle = document.createElement("button");
            handle.type = "button";
            handle.draggable = true;
            handle.className = styles.columnDragHandle ?? "";
            handle.title = "Drag to reorder column";
            handle.setAttribute("aria-label", `Drag ${column.title} to reorder`);
            header.append(handle);

            const onDragStart = (event: DragEvent) => {
                draggedColumnId = column.morphismId;
                event.dataTransfer?.setData(columnDragDataKey, column.morphismId);
                if (event.dataTransfer) {
                    event.dataTransfer.effectAllowed = "move";
                    const preview = columnDragPreview(header, index);
                    document.body.append(preview);
                    event.dataTransfer.setDragImage(
                        preview,
                        preview.getBoundingClientRect().width / 2,
                        14,
                    );
                    setTimeout(() => preview.remove(), 0);
                }
                clearIndicators();
                if (styles.columnDragSource) {
                    header.classList.add(styles.columnDragSource);
                }
            };
            const onDragEnd = () => {
                draggedColumnId = undefined;
                clearIndicators();
            };
            // Placement follows the pointer: the left half of the header means
            // "insert before", the right half "insert after", so a column can
            // be dropped at either end of the order.
            const placement = (event: DragEvent): "before" | "after" => {
                const bounds = header.getBoundingClientRect();
                return event.clientX < bounds.left + bounds.width / 2 ? "before" : "after";
            };
            const onDragOver = (event: DragEvent) => {
                if (!(draggedColumnId && draggedColumnId !== column.morphismId)) {
                    return;
                }
                event.preventDefault();
                if (event.dataTransfer) {
                    event.dataTransfer.dropEffect = "move";
                }
                clearIndicators();
                const className =
                    placement(event) === "before"
                        ? styles.columnDropBefore
                        : styles.columnDropAfter;
                if (className) {
                    header.classList.add(className);
                }
            };
            const onDrop = (event: DragEvent) => {
                const sourceId = event.dataTransfer?.getData(columnDragDataKey) || draggedColumnId;
                if (!(sourceId && sourceId !== column.morphismId)) {
                    return;
                }
                event.preventDefault();
                event.stopPropagation();
                clearIndicators();
                props.onColumnOrderChange(
                    moveItem(visibleIds, sourceId, column.morphismId, placement(event)),
                );
            };

            handle.addEventListener("click", suppressHeaderClick);
            handle.addEventListener("dragstart", onDragStart);
            handle.addEventListener("dragend", onDragEnd);
            header.addEventListener("dragover", onDragOver);
            header.addEventListener("dragleave", clearIndicators);
            header.addEventListener("drop", onDrop);
            cleanups.push(() => {
                handle.removeEventListener("click", suppressHeaderClick);
                handle.removeEventListener("dragstart", onDragStart);
                handle.removeEventListener("dragend", onDragEnd);
                header.removeEventListener("dragover", onDragOver);
                header.removeEventListener("dragleave", clearIndicators);
                header.removeEventListener("drop", onDrop);
            });
        }

        headerControlsCleanup = () => {
            for (const cleanup of cleanups) {
                cleanup();
            }
            clearIndicators();
        };
    };

    // Whether a deferred rebuild is already queued (see `rebuild`), so a burst
    // of signal bumps coalesces into a single rebuild.
    let rebuildScheduled = false;
    // Set on cleanup so a queued rebuild becomes a no-op after disposal.
    let disposed = false;

    /**
     * Schedule a rebuild for the next microtask rather than running it inline.
     *
     * The reactive effect that calls this can fire *synchronously from inside a
     * jspreadsheet callback*: a cell edit runs `onchange` -> `applyEdit` ->
     * `row.set`, which mutates the instance and (through the plain store's
     * synchronous change notification) bumps the document signals, re-running
     * the effect while jspreadsheet is still mid-edit. Destroying and recreating
     * the worksheet at that moment corrupts jspreadsheet's internal edit state
     * (`edition`), throwing "Cannot read properties of undefined". Deferring to a
     * microtask lets jspreadsheet finish the current operation first, and
     * coalesces the burst of signal bumps a single edit produces into one
     * rebuild.
     */
    const rebuild = () => {
        if (rebuildScheduled) {
            return;
        }
        rebuildScheduled = true;
        queueMicrotask(() => {
            rebuildScheduled = false;
            // The component may have been disposed while the rebuild was pending.
            if (disposed) {
                return;
            }
            rebuildNow();
        });
    };

    const rebuildNow = () => {
        if (worksheet) {
            headerControlsCleanup?.();
            headerControlsCleanup = undefined;
            // A rebuild can be triggered by a schema change (e.g. adding an
            // attribute) *while a cell edit is still open*. jspreadsheet only
            // commits an in-progress edit on blur/close, so destroying the
            // worksheet now would discard the typed-but-uncommitted value. Close
            // any open editor with save=true first so its `onchange` fires and
            // `applyEdit` writes the value back into the instance before we tear
            // the grid down.
            const editing = worksheet.edition;
            if (editing) {
                worksheet.closeEditor(editing[0], true);
            }
            jspreadsheet.destroy(host(), true);
            worksheet = undefined;
            // v5 leaves its tab and worksheet DOM inside the mutated host after
            // destroy, so recreating without clearing it duplicates the grid.
            container.replaceChildren();
            container.removeAttribute("class");
            container.removeAttribute("style");
        }
        const gridColumns = buildGridColumns();
        const data = buildData(gridColumns);
        if (data.length === 0) {
            rowIds = [];
            return;
        }

        const options: jspreadsheet.SpreadsheetOptions = {
            tabs: false,
            worksheets: [
                {
                    data,
                    columns: buildColumns(gridColumns),
                    minDimensions: [Math.max(gridColumns.length, 1), 0],
                    allowInsertRow: false,
                    allowInsertColumn: false,
                    allowDeleteColumn: false,
                    allowRenameColumn: false,
                    columnDrag: false,
                    columnSorting: gridColumns.length > 0,
                    rowDrag: false,
                },
            ],
            onchange: (_ws, _cell, cx, cy, newValue) => {
                applyEdit(gridColumns, Number(cx), Number(cy), newValue ?? "");
            },
            onselection: (ws, x1, y1, x2, y2, origin) => {
                // Open the reference-completion dropdown on a *single* click:
                // when exactly one mapping (dropdown) cell is selected by the
                // user (an `origin` event, not a programmatic selection), open
                // its editor immediately instead of requiring a double click.
                if (origin === undefined || x1 !== x2 || y1 !== y2) {
                    return;
                }
                if (gridColumns[x1]?.kind !== "mapping") {
                    return;
                }
                // Defer so this fires after jspreadsheet finishes its own
                // selection handling (which would otherwise close the editor).
                queueMicrotask(() => {
                    if (disposed || worksheet !== ws || ws.edition) {
                        return;
                    }
                    ws.openEditor(ws.getCellFromCoords(x1, y1), false);
                });
            },
            oninsertrow: (_ws, inserted) => {
                // A new grid row corresponds to a fresh, empty instance row.
                // Rows are valid even for a column-less entity: they are simply
                // empty records with no attribute/mapping values yet.
                for (const insertedRow of [...inserted].toSorted((a, b) => a.row - b.row)) {
                    const row = doc().instance.add(props.entity, {});
                    rowIds.splice(insertedRow.row, 0, row.id);
                }
            },
            onsort: (_ws, _column, _direction, newOrder) => {
                const previous = [...rowIds];
                rowIds = newOrder.flatMap((index) => {
                    const id = previous[index];
                    return id ? [id] : [];
                });
            },
            ondeleterow: (_ws, removed) => {
                for (const y of [...removed].toSorted((a, b) => b - a)) {
                    rowById(rowIds[y])?.delete();
                    rowIds.splice(y, 1);
                }
            },
        };
        const built = jspreadsheet(host(), options);
        worksheet = Array.isArray(built) ? built[0] : built;
        if (props.layoutControls !== false) {
            installHeaderControls(gridColumns);
        }
    };

    // Rebuild whenever this entity's table *shape* changes: its column set, a
    // mapping codomain, or the number of rows (rows added/removed from outside
    // this grid). Cell-value edits reconcile through `applyEdit` without a
    // rebuild, so typing is not interrupted.
    createEffect(
        on(
            () => {
                doc().trackSchema();
                doc().trackInstance();
                const columnSig = props.allColumns
                    .map((c) =>
                        c.kind === "attr"
                            ? `a:${c.morphismId}:${c.title}:${c.attrType}`
                            : `m:${c.morphismId}:${c.title}:${c.codomain.id}`,
                    )
                    .join(",");
                const hiddenSig = props.hiddenColumns.join(",");
                const rowSig = doc()
                    .instance.rowsOf(props.entity)
                    .map((row) => row.id)
                    .join(",");
                // Include the global shape signature so codomain-row relabels in
                // other tables (used as this table's FK sources) refresh too.
                return `${schemaShapeSignature(doc())}#${columnSig}#${hiddenSig}#${rowSig}`;
            },
            () => rebuild(),
        ),
    );

    createEffect(() => {
        const rowId = props.highlightedRowId;
        const request = props.highlightRequest;
        const collapsed = props.collapsed;
        if (!(rowId && request !== undefined) || collapsed) {
            return;
        }

        let selectedRow: HTMLTableRowElement | undefined;
        const dismissOnOutsidePointer = (event: PointerEvent) => {
            if (event.target instanceof Node && selectedRow?.contains(event.target)) {
                return;
            }
            document.removeEventListener("pointerdown", dismissOnOutsidePointer, true);
            worksheet?.resetSelection();
            props.onHighlightDismiss?.();
        };
        const frame = requestAnimationFrame(() => {
            const rowIndex = rowIds.indexOf(rowId);
            const row = container.querySelectorAll<HTMLTableRowElement>(
                "table.jss_worksheet tbody tr",
            )[rowIndex];
            if (!(row && worksheet)) {
                return;
            }
            selectedRow = row;
            worksheet.updateSelectionFromCoords(null, rowIndex, null, rowIndex);
            row.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
            document.addEventListener("pointerdown", dismissOnOutsidePointer, true);
        });
        onCleanup(() => {
            cancelAnimationFrame(frame);
            document.removeEventListener("pointerdown", dismissOnOutsidePointer, true);
            worksheet?.resetSelection();
        });
    });

    onCleanup(() => {
        disposed = true;
        headerControlsCleanup?.();
        if (worksheet) {
            jspreadsheet.destroy(host(), true);
            container.replaceChildren();
        }
    });

    return (
        <div
            class={styles.table}
            classList={{ [styles.collapsedTable ?? ""]: Boolean(props.collapsed) }}
            onClick={(event) => {
                if (
                    props.collapsed &&
                    props.onCollapsedChange &&
                    !(
                        event.target instanceof Element &&
                        event.target.closest("[data-table-drag-handle]")
                    )
                ) {
                    props.onCollapsedChange(false);
                }
            }}
        >
            <div class={styles.tableHeader}>
                <div class={styles.tableTitle}>
                    <Show when={props.layoutControls !== false}>
                        <button
                            ref={props.dragHandleRef}
                            class={styles.dragHandle}
                            data-table-drag-handle
                            type="button"
                            aria-label={`Drag ${props.entity.label || "Unnamed"} table`}
                            title="Drag to reorder table"
                        >
                            <GripVertical size={16} />
                        </button>
                    </Show>
                    <span
                        classList={{
                            [styles.entityName ?? ""]: true,
                            [styles.unnamed ?? ""]: !props.entity.label,
                        }}
                    >
                        {props.entity.label || "Unnamed"}
                    </span>
                </div>
                <Show when={props.layoutControls !== false && props.onCollapsedChange}>
                    <button
                        class={styles.tableCollapseButton}
                        type="button"
                        aria-label={`${props.collapsed ? "Expand" : "Collapse"} ${
                            props.entity.label || "Unnamed"
                        } table`}
                        title={props.collapsed ? "Expand table" : "Collapse table"}
                        aria-expanded={!props.collapsed}
                        onClick={(event) => {
                            event.stopPropagation();
                            props.onCollapsedChange?.(!props.collapsed);
                        }}
                    >
                        <Show when={props.collapsed} fallback={<Minus size={16} />}>
                            <ChevronRight size={16} />
                        </Show>
                    </button>
                </Show>
            </div>
            <div class={styles.grid}>
                <Show when={!hasRows()}>
                    <div class={styles.noRows}>No rows</div>
                </Show>
                <div ref={container} />
            </div>
            <div class={styles.tableFooter}>
                <button
                    class={styles.addRow}
                    type="button"
                    onClick={() => doc().instance.add(props.entity, {})}
                >
                    + Row
                </button>
            </div>
        </div>
    );
}
