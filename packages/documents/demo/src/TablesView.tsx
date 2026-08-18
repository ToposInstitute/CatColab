import { createEffect, createMemo, createSignal, For, onCleanup } from "solid-js";

import type { AttrTypeName, DemoDocument } from "./document";
import { tableSpecs, type TableSpec } from "./instance-model";
import { type AddColumnChoice, InstanceTable } from "./InstanceTable";
import {
    mergeVisibleOrder,
    moveItem,
    reconcileTableLayout,
    type TableLayout,
} from "./table-layout";
import { commitTableLayout, raiseTable, savedTableLayout } from "./table-layout-store";

import styles from "./TablesView.module.css";

/**
 * The instance's expanded tables: each table selected from the file sidebar's
 * tables list renders its grid here, newest raise on top. Grids reorder by
 * drag, columns collapse and reorder, and foreign keys navigate across tables.
 * The layout is persisted outside the documents (keyed by entity/morphism
 * UUIDs) in the shared {@link savedTableLayout} store, so the sidebar list and
 * every view that renders the tables stay in sync.
 *
 * Used by the instance panel's Tables mode as-is; the Sheet view passes the
 * optional schema-editing affordances (add/rename/retype columns) through to
 * each table.
 */
export function TablesView(props: {
    doc: DemoDocument;
    /** Offered by each table's "+ Column" button; see {@link InstanceTable}. */
    addColumnChoices?: AddColumnChoice[];
    /** Add a column to the given entity's table. */
    onAddColumn?: (entityId: string, key: string) => void;
    onRenameColumn?: (morphismId: string, title: string) => void;
    onChangeColumnType?: (morphismId: string, type: AttrTypeName) => void;
}) {
    const doc = () => props.doc;

    const specs = createMemo(() => {
        doc().trackSchema();
        doc().trackInstance();
        return tableSpecs(doc());
    });

    const [rowFocus, setRowFocus] = createSignal<{
        tableId: string;
        rowId: string;
        request: number;
    }>();
    let rowFocusRequest = 0;

    const layout = createMemo(() =>
        reconcileTableLayout(
            savedTableLayout(),
            specs().map((spec) => ({
                id: spec.entity.id,
                columnIds: spec.columns.map((column) => column.morphismId),
            })),
        ),
    );

    const orderedSpecs = createMemo(() => {
        const byId = new Map(specs().map((spec) => [spec.entity.id, spec]));
        return layout().tableOrder.flatMap((id) => {
            const spec = byId.get(id);
            return spec ? [spec] : [];
        });
    });
    const visibleTableIds = createMemo(() => orderedSpecs().map((spec) => spec.entity.id));

    // Commit against the *reconciled* layout, so updates always see an entry
    // for every live table (e.g. `current.columns[tableId]` below).
    const commitLayout = (update: (current: TableLayout) => TableLayout) =>
        commitTableLayout(() => update(layout()));

    const moveExpandedTable = (sourceId: string, targetId: string, placement: "before" | "after") =>
        commitLayout((current) => ({
            ...current,
            expandedOrder: moveItem(current.expandedOrder, sourceId, targetId, placement),
        }));

    const orderedColumns = (spec: TableSpec) => {
        const byId = new Map(spec.columns.map((column) => [column.morphismId, column]));
        return (layout().columns[spec.entity.id]?.order ?? []).flatMap((id) => {
            const column = byId.get(id);
            return column ? [column] : [];
        });
    };

    // Every table is listed in the file sidebar; the expanded ones (those not
    // collapsed) render their full grid here, ordered by when they were last
    // expanded, newest on top.
    const visibleSet = createMemo(() => new Set(visibleTableIds()));
    const expandedTableIds = createMemo(() => {
        const collapsed = new Set(layout().hiddenTables);
        const live = visibleSet();
        return layout().expandedOrder.filter((id) => live.has(id) && !collapsed.has(id));
    });

    const setTableCollapsed = (tableId: string, collapsed: boolean) =>
        commitLayout((current) => {
            const hidden = new Set(current.hiddenTables);
            if (hidden.has(tableId) === collapsed) {
                return current;
            }
            return {
                ...current,
                hiddenTables: collapsed
                    ? [...current.hiddenTables, tableId]
                    : current.hiddenTables.filter((id) => id !== tableId),
                // Newly expanded tables go on top; collapsing drops them from
                // the expanded order entirely.
                expandedOrder: collapsed
                    ? current.expandedOrder.filter((id) => id !== tableId)
                    : [tableId, ...current.expandedOrder.filter((id) => id !== tableId)],
            };
        });

    const focusForeignRow = (tableId: string, rowId: string) => {
        raiseTable(tableId);
        setRowFocus({ tableId, rowId, request: ++rowFocusRequest });
    };

    const TableCard = (cardProps: { tableId: string }) => {
        const tableId = cardProps.tableId;
        // Looked up per render: the component stays mounted across fresh
        // table-spec projections and instance edits.
        const spec = () =>
            specs().find((candidate) => candidate.entity.id === tableId) as TableSpec;
        const allColumns = () => orderedColumns(spec());
        const hiddenColumns = () => layout().columns[tableId]?.hidden ?? [];
        return (
            <SortableTable tableId={tableId} onMove={moveExpandedTable}>
                {(dragHandleRef) => (
                    <InstanceTable
                        doc={doc()}
                        entity={spec().entity}
                        allColumns={allColumns()}
                        hiddenColumns={hiddenColumns()}
                        highlightedRowId={
                            rowFocus()?.tableId === tableId ? rowFocus()?.rowId : undefined
                        }
                        highlightRequest={
                            rowFocus()?.tableId === tableId ? rowFocus()?.request : undefined
                        }
                        onHighlightDismiss={() => setRowFocus(undefined)}
                        onForeignKeyNavigate={focusForeignRow}
                        onCollapsedChange={(collapsed) => setTableCollapsed(tableId, collapsed)}
                        dragHandleRef={dragHandleRef}
                        onColumnOrderChange={(visibleOrder) =>
                            commitLayout((current) => {
                                const columns = current.columns[tableId];
                                if (!columns) {
                                    return current;
                                }
                                return {
                                    ...current,
                                    columns: {
                                        ...current.columns,
                                        [tableId]: {
                                            ...columns,
                                            order: mergeVisibleOrder(columns.order, visibleOrder),
                                        },
                                    },
                                };
                            })
                        }
                        onColumnsVisibleChange={(ids, visible) =>
                            commitLayout((current) => {
                                const columns = current.columns[tableId];
                                if (!columns) {
                                    return current;
                                }
                                const idSet = new Set(ids);
                                return {
                                    ...current,
                                    columns: {
                                        ...current.columns,
                                        [tableId]: {
                                            ...columns,
                                            hidden: visible
                                                ? columns.hidden.filter((id) => !idSet.has(id))
                                                : [...new Set([...columns.hidden, ...ids])],
                                        },
                                    },
                                };
                            })
                        }
                        {...(props.addColumnChoices
                            ? { addColumnChoices: props.addColumnChoices }
                            : {})}
                        {...(props.onAddColumn
                            ? { onAddColumn: (key: string) => props.onAddColumn?.(tableId, key) }
                            : {})}
                        {...(props.onRenameColumn ? { onRenameColumn: props.onRenameColumn } : {})}
                        {...(props.onChangeColumnType
                            ? { onChangeColumnType: props.onChangeColumnType }
                            : {})}
                    />
                )}
            </SortableTable>
        );
    };

    return (
        <div class={styles.tables}>
            <div class={styles.openTables}>
                <For each={expandedTableIds()}>{(tableId) => <TableCard tableId={tableId} />}</For>
            </div>
        </div>
    );
}

const tableDragDataKey = "application/x-catcolab-table";
// The id of the table currently being dragged, shared by all sortable cards.
let activeTableDrag: string | undefined;
let activeTableDropMarker: (() => void) | undefined;

/** Clear the marker on whichever card most recently accepted the drag. */
const clearTableDropMarker = () => {
    const clear = activeTableDropMarker;
    activeTableDropMarker = undefined;
    clear?.();
};

type MoveTable = (sourceId: string, targetId: string, placement: "before" | "after") => void;

/**
 * Wire drag-to-reorder onto one card: a drag handle starts the drag, and the
 * card body accepts a drop from another table. `axis` picks whether the
 * before/after split follows the pointer's X or Y.
 */
function useTableSortable(options: {
    root: () => HTMLElement;
    handle: () => HTMLElement;
    tableId: () => string;
    axis: "x" | "y";
    onMove: MoveTable;
    setDragging: (value: boolean) => void;
    setDropPlacement: (value: "before" | "after" | null) => void;
}) {
    createEffect(() => {
        const root = options.root();
        const handle = options.handle();
        const tableId = options.tableId();
        handle.draggable = true;
        const clearDropPlacement = () => options.setDropPlacement(null);
        const placement = (event: DragEvent): "before" | "after" => {
            const bounds = root.getBoundingClientRect();
            return options.axis === "y"
                ? event.clientY < bounds.top + bounds.height / 2
                    ? "before"
                    : "after"
                : event.clientX < bounds.left + bounds.width / 2
                  ? "before"
                  : "after";
        };
        const acceptsDrag = () => activeTableDrag && activeTableDrag !== tableId;
        const onDragStart = (event: DragEvent) => {
            clearTableDropMarker();
            activeTableDrag = tableId;
            event.dataTransfer?.setData(tableDragDataKey, tableId);
            if (event.dataTransfer) {
                event.dataTransfer.effectAllowed = "move";
            }
            options.setDragging(true);
        };
        const onDragEnd = () => {
            clearTableDropMarker();
            activeTableDrag = undefined;
            options.setDragging(false);
        };
        const onDragOver = (event: DragEvent) => {
            if (!acceptsDrag()) {
                return;
            }
            event.preventDefault();
            if (event.dataTransfer) {
                event.dataTransfer.dropEffect = "move";
            }
            if (activeTableDropMarker !== clearDropPlacement) {
                clearTableDropMarker();
                activeTableDropMarker = clearDropPlacement;
            }
            options.setDropPlacement(placement(event));
        };
        const onDragLeave = (event: DragEvent) => {
            if (event.relatedTarget instanceof Node && root.contains(event.relatedTarget)) {
                return;
            }
            if (activeTableDropMarker === clearDropPlacement) {
                activeTableDropMarker = undefined;
            }
            clearDropPlacement();
        };
        const onDrop = (event: DragEvent) => {
            const sourceId = event.dataTransfer?.getData(tableDragDataKey) || activeTableDrag;
            if (!(acceptsDrag() && sourceId)) {
                return;
            }
            event.preventDefault();
            event.stopPropagation();
            const finalPlacement = placement(event);
            clearTableDropMarker();
            options.onMove(sourceId, tableId, finalPlacement);
        };

        handle.addEventListener("dragstart", onDragStart);
        handle.addEventListener("dragend", onDragEnd);
        root.addEventListener("dragover", onDragOver);
        root.addEventListener("dragleave", onDragLeave);
        root.addEventListener("drop", onDrop);
        onCleanup(() => {
            handle.removeEventListener("dragstart", onDragStart);
            handle.removeEventListener("dragend", onDragEnd);
            root.removeEventListener("dragover", onDragOver);
            root.removeEventListener("dragleave", onDragLeave);
            root.removeEventListener("drop", onDrop);
            if (activeTableDropMarker === clearDropPlacement) {
                activeTableDropMarker = undefined;
            }
        });
    });
}

/** One expanded table's grid card on the right, reorderable along the X axis. */
function SortableTable(props: {
    tableId: string;
    onMove: MoveTable;
    children: (
        dragHandleRef: (element: HTMLButtonElement) => void,
    ) => ReturnType<typeof InstanceTable>;
}) {
    let root!: HTMLDivElement;
    let handle!: HTMLButtonElement;
    const [dragging, setDragging] = createSignal(false);
    const [dropPlacement, setDropPlacement] = createSignal<"before" | "after" | null>(null);

    useTableSortable({
        root: () => root,
        handle: () => handle,
        tableId: () => props.tableId,
        axis: "x",
        onMove: props.onMove,
        setDragging,
        setDropPlacement,
    });

    return (
        <div
            ref={root}
            class={styles.tableCard}
            classList={{
                [styles.dragging ?? ""]: dragging(),
                [styles.dropBefore ?? ""]: dropPlacement() === "before",
                [styles.dropAfter ?? ""]: dropPlacement() === "after",
            }}
        >
            {props.children((element) => (handle = element))}
        </div>
    );
}
