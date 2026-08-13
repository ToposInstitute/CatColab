export const TABLE_LAYOUT_STORAGE_KEY = "catcolab-instances-demo:table-layout:v1";

export type ColumnLayout = {
    order: string[];
    hidden: string[];
};

export type TableLayout = {
    version: 1;
    tableOrder: string[];
    /** Tables collapsed down to just their header (the name keeps the field
     * backwards-compatible with layouts saved when tables could be hidden). */
    hiddenTables: string[];
    /** Expanded tables, most-recently-expanded first: the order their grids
     * appear on the right, independent of the tab order on the left. */
    expandedOrder: string[];
    columns: Record<string, ColumnLayout>;
};

export const emptyTableLayout = (): TableLayout => ({
    version: 1,
    tableOrder: [],
    hiddenTables: [],
    expandedOrder: [],
    columns: {},
});

/** Append new IDs without discarding IDs that may return through schema undo. */
export function mergeOrder(saved: readonly string[], current: readonly string[]): string[] {
    const result = [...new Set(saved)];
    for (const id of current) {
        if (!result.includes(id)) {
            result.push(id);
        }
    }
    return result;
}

export function reconcileTableLayout(
    saved: TableLayout,
    tables: readonly { id: string; columnIds: readonly string[] }[],
): TableLayout {
    const knownTables = new Set(saved.tableOrder);
    const liveTables = new Set(tables.map((table) => table.id));
    const columns = { ...saved.columns };
    for (const table of tables) {
        const previous = columns[table.id];
        columns[table.id] = {
            order: mergeOrder(previous?.order ?? [], table.columnIds),
            hidden: previous?.hidden ?? [],
        };
    }
    return {
        version: 1,
        tableOrder: mergeOrder(
            saved.tableOrder,
            tables.map((table) => table.id),
        ),
        hiddenTables: mergeOrder(
            saved.hiddenTables,
            tables.filter((table) => !knownTables.has(table.id)).map((table) => table.id),
        ),
        // Drop ids for deleted tables, then append any live, non-collapsed
        // table missing from the order (e.g. from a layout saved before the
        // expanded order existed) so its grid still shows.
        expandedOrder: mergeOrder(
            saved.expandedOrder.filter((id) => liveTables.has(id)),
            tables
                .map((table) => table.id)
                .filter((id) => knownTables.has(id) && !saved.hiddenTables.includes(id)),
        ),
        columns,
    };
}

export function moveItem(
    order: readonly string[],
    sourceId: string,
    targetId: string,
    placement: "before" | "after",
): string[] {
    if (sourceId === targetId || !order.includes(sourceId) || !order.includes(targetId)) {
        return [...order];
    }
    const result = order.filter((id) => id !== sourceId);
    const targetIndex = result.indexOf(targetId);
    result.splice(targetIndex + (placement === "after" ? 1 : 0), 0, sourceId);
    return result;
}

/** Replace only visible slots so moving a grid column does not displace hidden columns. */
export function mergeVisibleOrder(
    fullOrder: readonly string[],
    visibleOrder: readonly string[],
): string[] {
    const visible = new Set(visibleOrder);
    let index = 0;
    return fullOrder.map((id) => (visible.has(id) ? (visibleOrder[index++] ?? id) : id));
}

export function parseTableLayout(value: string | null): TableLayout {
    if (!value) {
        return emptyTableLayout();
    }
    try {
        const parsed: unknown = JSON.parse(value);
        if (
            typeof parsed === "object" &&
            parsed !== null &&
            "version" in parsed &&
            parsed.version === 1 &&
            "tableOrder" in parsed &&
            isStringArray(parsed.tableOrder) &&
            "hiddenTables" in parsed &&
            isStringArray(parsed.hiddenTables) &&
            "columns" in parsed &&
            typeof parsed.columns === "object" &&
            parsed.columns !== null
        ) {
            const columns: Record<string, ColumnLayout> = {};
            for (const [id, candidate] of Object.entries(parsed.columns)) {
                if (
                    typeof candidate !== "object" ||
                    candidate === null ||
                    !("order" in candidate) ||
                    !isStringArray(candidate.order) ||
                    !("hidden" in candidate) ||
                    !isStringArray(candidate.hidden)
                ) {
                    return emptyTableLayout();
                }
                columns[id] = { order: candidate.order, hidden: candidate.hidden };
            }
            return {
                version: 1,
                tableOrder: parsed.tableOrder,
                hiddenTables: parsed.hiddenTables,
                // Older saved layouts predate the expanded order; default to
                // empty and let it repopulate as tables are expanded.
                expandedOrder:
                    "expandedOrder" in parsed && isStringArray(parsed.expandedOrder)
                        ? parsed.expandedOrder
                        : [],
                columns,
            };
        }
    } catch {
        // A malformed preference should not prevent the demo from loading.
    }
    return emptyTableLayout();
}

const isStringArray = (value: unknown): value is string[] =>
    Array.isArray(value) && value.every((item) => typeof item === "string");
