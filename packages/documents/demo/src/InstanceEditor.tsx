import {
    createEffect,
    createMemo,
    createSignal,
    For,
    Match,
    onCleanup,
    Show,
    Switch,
} from "solid-js";

import type { DiagramValidationResult } from "catcolab-documents";
import type { DemoDocument } from "./document";
import { HistorySidebar } from "./HistorySidebar";
import { HistoryToggle } from "./HistoryToggle";
import { tableSpecs, type TableSpec } from "./instance-model";
import { InstanceMillerEditor } from "./InstanceMillerEditor";
import { InstanceTable } from "./InstanceTable";
import { SketchSeparator } from "./Rough";
import {
    emptyTableLayout,
    mergeVisibleOrder,
    moveItem,
    parseTableLayout,
    reconcileTableLayout,
    TABLE_LAYOUT_STORAGE_KEY,
    type TableLayout,
} from "./table-layout";
import { TableTab } from "./TableTab";

import styles from "./InstanceEditor.module.css";

/**
 * The right-hand instance editor. It renders one spreadsheet table per schema
 * entity, following the demo's structural rules:
 *
 *  - entity added / deleted  -> a table appears / disappears;
 *  - morphism added / deleted, or its domain changed -> a column appears /
 *    disappears in the appropriate table;
 *  - a mapping's codomain changed -> foreign-key cells pointing at rows of the
 *    old codomain are shown as invalid.
 *
 * Presentation preferences are keyed by entity and morphism UUIDs and persisted
 * separately from the document, so layout changes do not enter undo history.
 */
export function InstanceEditor(props: {
    doc: DemoDocument;
    active: () => boolean;
    onActivate: () => void;
}) {
    const doc = () => props.doc;

    const specs = createMemo(() => {
        doc().trackSchema();
        doc().trackInstance();
        return tableSpecs(doc());
    });

    const [historyOpen, setHistoryOpen] = createSignal(false);
    const [editorMode, setEditorMode] = createSignal<"columns" | "tables">("tables");
    const [savedLayout, setSavedLayout] = createSignal(loadTableLayout());
    const [rowFocus, setRowFocus] = createSignal<{
        tableId: string;
        rowId: string;
        request: number;
    }>();
    let rowFocusRequest = 0;

    const layout = createMemo(() =>
        reconcileTableLayout(
            savedLayout(),
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

    const commitLayout = (update: (current: TableLayout) => TableLayout) => {
        const next = update(layout());
        setSavedLayout(next);
        try {
            localStorage.setItem(TABLE_LAYOUT_STORAGE_KEY, JSON.stringify(next));
        } catch (error) {
            console.warn("Could not persist table layout", error);
        }
    };

    const moveTable = (sourceId: string, targetId: string, placement: "before" | "after") =>
        commitLayout((current) => ({
            ...current,
            tableOrder: moveItem(current.tableOrder, sourceId, targetId, placement),
        }));

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

    // Every table keeps its tab in the left rail; the expanded ones (those not
    // collapsed) also render their full grid on the right, ordered by when they
    // were last expanded, newest on top.
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

    // Clicking a tab always expands its table and raises its grid to the top,
    // whether or not it was already expanded.
    const raiseTable = (tableId: string) =>
        commitLayout((current) => ({
            ...current,
            hiddenTables: current.hiddenTables.filter((id) => id !== tableId),
            expandedOrder: [tableId, ...current.expandedOrder.filter((id) => id !== tableId)],
        }));

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
                    />
                )}
            </SortableTable>
        );
    };

    return (
        <div
            class={styles.panelLayout}
            onFocusIn={() => props.onActivate()}
            onPointerDown={() => props.onActivate()}
        >
            <div class={styles.panelColumn}>
                <div class={styles.panel}>
                    <div class={styles.header}>
                        <SketchSeparator edge="bottom" seed={83} />
                        <div class={styles.headerLeft}>
                            <h2>Instance</h2>
                            <ValidationBadge doc={doc()} />
                        </div>
                        <div class={styles.headerRight}>
                            <wired-radio-group
                                class={styles.viewSwitch}
                                aria-label="Instance editor view"
                                selected={editorMode()}
                                on:selected={(event) =>
                                    setEditorMode(event.detail.selected as "tables" | "columns")
                                }
                            >
                                <wired-radio name="tables" checked={editorMode() === "tables"}>
                                    Tables
                                </wired-radio>
                                <wired-radio name="columns" checked={editorMode() === "columns"}>
                                    Columns
                                </wired-radio>
                            </wired-radio-group>
                            <HistoryToggle
                                open={historyOpen()}
                                onToggle={() => setHistoryOpen((v) => !v)}
                            />
                        </div>
                    </div>
                    <Show
                        when={specs().length > 0}
                        fallback={
                            <div class={styles.empty}>
                                Add an entity on the left to edit its instance.
                            </div>
                        }
                    >
                        <Switch>
                            <Match when={editorMode() === "tables"}>
                                <div class={styles.tables}>
                                    <aside class={styles.tabRail} aria-label="Tables">
                                        <div class={styles.tabStack}>
                                            <For each={visibleTableIds()}>
                                                {(tableId) => {
                                                    const spec = () =>
                                                        specs().find(
                                                            (candidate) =>
                                                                candidate.entity.id === tableId,
                                                        ) as TableSpec;
                                                    return (
                                                        <SortableTab
                                                            tableId={tableId}
                                                            onMove={moveTable}
                                                        >
                                                            {(dragHandleRef) => (
                                                                <TableTab
                                                                    entity={spec().entity}
                                                                    expanded={
                                                                        !layout().hiddenTables.includes(
                                                                            tableId,
                                                                        )
                                                                    }
                                                                    rowCount={spec().rows.length}
                                                                    onSelect={() =>
                                                                        raiseTable(tableId)
                                                                    }
                                                                    dragHandleRef={dragHandleRef}
                                                                />
                                                            )}
                                                        </SortableTab>
                                                    );
                                                }}
                                            </For>
                                        </div>
                                    </aside>
                                    <div class={styles.openTables}>
                                        <For each={expandedTableIds()}>
                                            {(tableId) => <TableCard tableId={tableId} />}
                                        </For>
                                    </div>
                                </div>
                            </Match>
                            <Match when={editorMode() === "columns"}>
                                <InstanceMillerEditor doc={doc()} />
                            </Match>
                        </Switch>
                    </Show>
                </div>
            </div>
            <Show when={historyOpen()}>
                <HistorySidebar history={doc().instanceHistory} active={props.active} />
            </Show>
        </div>
    );
}

const tableDragDataKey = "application/x-catcolab-table";
// The id of the table currently being dragged, shared by both sortable regions.
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
 * before/after split follows the pointer's X (horizontal open grids) or Y (the
 * vertical tab rail).
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

/** One tab in the left rail, reorderable along the Y axis. */
function SortableTab(props: {
    tableId: string;
    onMove: MoveTable;
    children: (dragHandleRef: (element: HTMLButtonElement) => void) => ReturnType<typeof TableTab>;
}) {
    let root!: HTMLDivElement;
    let handle!: HTMLButtonElement;
    const [dragging, setDragging] = createSignal(false);
    const [dropPlacement, setDropPlacement] = createSignal<"before" | "after" | null>(null);

    useTableSortable({
        root: () => root,
        handle: () => handle,
        tableId: () => props.tableId,
        axis: "y",
        onMove: props.onMove,
        setDragging,
        setDropPlacement,
    });

    return (
        <div
            ref={root}
            class={styles.tabCard}
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

function loadTableLayout(): TableLayout {
    try {
        return parseTableLayout(localStorage.getItem(TABLE_LAYOUT_STORAGE_KEY));
    } catch {
        return emptyTableLayout();
    }
}

/** A live validity badge from `instance.onValidate()`. */
function ValidationBadge(props: { doc: DemoDocument }) {
    // The observer follows the instance's own rows *and* the schema's whole
    // model tree through the elaboration cache, so no manual subscription to
    // the schema is needed, and equivalent results are never re-delivered.
    const [validation, setValidation] = createSignal<DiagramValidationResult>();
    const unsubscribe = props.doc.instance.onValidate(setValidation);
    onCleanup(unsubscribe);

    const displayTag = () => validation()?.tag ?? "Checking";

    return (
        <span class={styles.badge} data-tag={displayTag()}>
            {displayTag()}
        </span>
    );
}
