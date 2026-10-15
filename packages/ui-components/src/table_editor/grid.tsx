import {
    createSignal,
    Show,
    Index,
    onCleanup,
    createComputed,
    createMemo,
    untrack,
    useContext,
} from "solid-js";

import type { InstanceTable, LiteralValue, TableHeader, TableRow } from "catcolab-documents";
import type { FocusHandle } from "../util/focus";
import { ColumnHeader } from "./column_header";
import { COLUMN_WIDTHS, DELETE_COLUMN_WIDTH, EMPTY_COLUMN_WIDTH } from "./display";
import { GridProvider, useGridController } from "./grid_controller";
import { GridRows } from "./grid_rows";
import { navigationDirection, neighborKey, parseCellKey } from "./navigation";
import type { IssueLookup } from "./validation";
import { createTableViewport, ROW_HEIGHT, ViewportContext } from "./viewport";

import styles from "./table_editor.module.css";

type TableGridProps = {
    issuesAt: IssueLookup;
    onDeleteOrphanedColumn?: (header: TableHeader) => void;
    focus: FocusHandle;
    table: InstanceTable;
    allTables: ReadonlyArray<InstanceTable>;
    onSetField: (row: TableRow, header: TableHeader, value: LiteralValue | TableRow) => void;
    onAddRow: () => void;
    onDeleteRow: (row: TableRow) => void;
};

/** The truly editable part of the [`TableEditor`]. */
export function TableGrid(props: TableGridProps) {
    const viewport = createTableViewport(() => props.table.rows);
    return (
        <ViewportContext.Provider value={viewport}>
            <GridProvider
                focus={props.focus}
                table={() => props.table}
                allTables={() => props.allTables}
                onSetField={props.onSetField}
                onAddRow={props.onAddRow}
            >
                <div class={styles.scrollViewport}>
                    <GridContent {...props} virtualRows={viewport.virtual()} />
                </div>
                <Show when={props.table.label !== null}>
                    <Footer />
                </Show>
            </GridProvider>
        </ViewportContext.Provider>
    );
}

/** Translate browser boundary exits into logical focus changes before an
editor's blur handler or teardown can swallow the bubbling focusout event. */
function bindFocusBoundary(element: HTMLElement, leave: () => void) {
    const onBlur = (evt: FocusEvent) => {
        const next = evt.relatedTarget;
        if (next instanceof Node) {
            if (!element.contains(next)) {
                leave();
            }
        } else {
            // Removal and window blur have no destination. Allow focus restoration
            // after DOM changes before interpreting this as an exit.
            queueMicrotask(() => {
                if (element.isConnected && !element.contains(document.activeElement)) {
                    leave();
                }
            });
        }
    };
    element.addEventListener("blur", onBlur, true);
    onCleanup(() => element.removeEventListener("blur", onBlur, true));
}

/** The footer with the button for adding a row. */
function Footer() {
    const edit = useGridController();
    return (
        <div
            class={styles.footer}
            ref={(element) => bindFocusBoundary(element, edit.leaveFooter)}
            onFocusIn={() => edit.enterFooter()}
        >
            <button class={styles.addRow} type="button" onClick={() => edit.addRow()}>
                + Row
            </button>
        </div>
    );
}

function GridContent(
    props: TableGridProps & {
        virtualRows: ReturnType<ReturnType<typeof createTableViewport>["virtual"]>;
    },
) {
    const edit = useGridController();
    const headers = () => props.table.headers;
    const headerIndex = edit.headerIndex;
    const [deletingColumnId, setDeletingColumnId] = createSignal<string | null>(null);
    const viewport = useContext(ViewportContext);
    if (!viewport) {
        throw new Error("GridContent must be inside ViewportContext");
    }
    const selectedIndex = createMemo(() => {
        const key = edit.activeKey();
        return key ? props.table.rows.findIndex((row) => row.id === parseCellKey(key).rowId) : -1;
    });
    // Mount the destination synchronously, before cell DOM focus effects run.
    createComputed(() => {
        const key = edit.activeKey();
        const index = selectedIndex();
        const area = viewport.area();
        if (key && area && index >= 0) {
            untrack(() => viewport.revealRow(index));
        }
    });
    const selectedMounted = () => {
        const key = edit.activeKey();
        return (
            key !== null &&
            props.virtualRows.visibleItems.some((row) => row.id === parseCellKey(key).rowId)
        );
    };

    return (
        <>
            <div
                class={styles.scrollArea}
                tabindex={-1}
                ref={(element) => {
                    bindFocusBoundary(element, edit.leaveGrid);
                    viewport.setArea(element);
                }}
                onScroll={viewport.scroll}
                onFocus={(evt) => {
                    if (evt.target === evt.currentTarget) {
                        // Commit before virtual row slots are rebound, retaining
                        // selection and browser focus on the scroll container.
                        edit.commitEdit();
                    }
                }}
                onKeyDown={(evt) => {
                    if (evt.defaultPrevented || evt.ctrlKey || evt.metaKey || evt.altKey) {
                        return;
                    }
                    // Editors and other controls handle their own keyboard events.
                    const target = evt.target as HTMLElement;
                    if (
                        target !== evt.currentTarget &&
                        target !== evt.currentTarget.querySelector("table")
                    ) {
                        return;
                    }
                    const key = edit.activeKey();
                    if (!key) {
                        return;
                    }
                    const direction = navigationDirection(evt);
                    if (!direction) {
                        if (edit.onCellKey(evt, key)) {
                            if (viewport.parked()) {
                                viewport.revealRow(selectedIndex());
                            }
                            evt.preventDefault();
                        }
                        return;
                    }
                    const next = neighborKey(props.table, headerIndex(), key, direction);
                    if (next) {
                        edit.cellFocus(next).setFocused(true);
                    } else {
                        viewport.revealRow(selectedIndex());
                    }
                    evt.currentTarget.querySelector("table")?.focus({ preventScroll: true });
                    evt.preventDefault();
                }}
            >
                <table
                    ref={(element) => {
                        edit.setGridElement(element);
                        viewport.setTable(element);
                    }}
                    class={styles.grid}
                    role="grid"
                    tabindex={edit.hasEditor() ? -1 : 0}
                    // Include the column header row in the grid's total row count.
                    aria-rowcount={props.table.rows.length + 1}
                    aria-activedescendant={
                        selectedMounted() ? edit.cellId(edit.activeKey()!) : undefined
                    }
                    onFocus={(evt) => {
                        if (evt.target === evt.currentTarget) {
                            edit.enterGrid();
                        }
                    }}
                >
                    <colgroup>
                        <col class={styles.rowHeaderColumn} />
                        <Show
                            when={headers().length > 0}
                            fallback={<col style={{ width: `${EMPTY_COLUMN_WIDTH}px` }} />}
                        >
                            <Index each={headers()}>
                                {(header) => (
                                    <col
                                        style={{ width: `${COLUMN_WIDTHS[header().type.tag]}px` }}
                                    />
                                )}
                            </Index>
                        </Show>
                        <col style={{ width: `${DELETE_COLUMN_WIDTH}px` }} />
                    </colgroup>
                    <thead ref={viewport.setHead}>
                        <tr>
                            <th class={styles.columnHeader} scope="col" />
                            <Show
                                when={headers().length > 0}
                                fallback={<th class={styles.columnHeader} scope="col" />}
                            >
                                <Index each={headers()}>
                                    {(header) => (
                                        <th
                                            class={styles.columnHeader}
                                            classList={{
                                                [styles.columnDeleting]:
                                                    deletingColumnId() === header().id,
                                            }}
                                            scope="col"
                                        >
                                            <ColumnHeader
                                                header={header()}
                                                onDelete={
                                                    props.table.label !== null &&
                                                    header().type.tag === "Unknown"
                                                        ? props.onDeleteOrphanedColumn
                                                        : undefined
                                                }
                                                onDeleting={setDeletingColumnId}
                                            />
                                        </th>
                                    )}
                                </Index>
                            </Show>
                            <th class={styles.columnHeader} scope="col" />
                        </tr>
                    </thead>
                    <GridRows
                        tableId={props.table.id}
                        issuesAt={props.issuesAt}
                        deletingColumnId={deletingColumnId()}
                        rows={props.virtualRows.visibleItems}
                        totalRows={props.table.rows.length}
                        topSpacer={props.virtualRows.viewerTop}
                        bottomSpacer={Math.max(
                            0,
                            props.virtualRows.containerHeight -
                                props.virtualRows.viewerTop -
                                props.virtualRows.visibleItems.length * ROW_HEIGHT,
                        )}
                        headers={headers()}
                        headerIndex={headerIndex}
                        allTables={props.allTables}
                        onDeleteRow={props.onDeleteRow}
                    />
                </table>
            </div>
            <div
                class={styles.scrollIndicators}
                aria-hidden="true"
                style={{
                    width: `${viewport.edges().width}px`,
                    height: `${viewport.edges().height}px`,
                    "--scroll-header-height": `${viewport.headerHeight()}px`,
                }}
            >
                <Show when={viewport.edges().top}>
                    <div class={styles.scrollTop} data-scroll-direction="top" />
                </Show>
                <Show when={viewport.edges().bottom}>
                    <div class={styles.scrollBottom} data-scroll-direction="bottom" />
                </Show>
                <Show when={viewport.edges().left}>
                    <div class={styles.scrollLeft} data-scroll-direction="left" />
                </Show>
                <Show when={viewport.edges().right}>
                    <div class={styles.scrollRight} data-scroll-direction="right" />
                </Show>
            </div>
        </>
    );
}
