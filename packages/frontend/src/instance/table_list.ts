import { createContext, useContext } from "solid-js";
import { createStore, produce, reconcile } from "solid-js/store";
import invariant from "tiny-invariant";

/** Minimal description of an instance table, for listing outside the editor. */
export type TableSummary = {
    id: string;
    label: string | null;
};

/** Page-level UI state for the tables of open instance documents.

Mounted instance editors register their tables here so that the sidebar can list
them, and both sides share which tables are hidden. Keyed by document ref ID.
 */
export type TableList = {
    /** Tables registered for a document. Empty if none is mounted. */
    tables: (refId: string) => ReadonlyArray<TableSummary>;

    /** Register (or, with `undefined`, unregister) the tables of a document. */
    setTables: (refId: string, tables: ReadonlyArray<TableSummary> | undefined) => void;

    isVisible: (refId: string, tableId: string) => boolean;
    show: (refId: string, tableId: string) => void;
    hide: (refId: string, tableId: string) => void;
};

export const TableListContext = createContext<TableList>();

export function useTableList(): TableList {
    const tableList = useContext(TableListContext);
    invariant(tableList, "Table list must be provided as context");
    return tableList;
}

export function createTableList(): TableList {
    // Stable empty array so unmounted documents don't produce a fresh array
    // (and hence spurious re-rendering) on each reactive read.
    const noTables: ReadonlyArray<TableSummary> = [];

    const [state, setState] = createStore<{
        tables: Record<string, TableSummary[]>;
        hidden: Record<string, Record<string, true>>;
    }>({ tables: {}, hidden: {} });

    return {
        tables: (refId) => state.tables[refId] ?? noTables,
        setTables: (refId, tables) => {
            if (tables) {
                setState("tables", refId, reconcile([...tables], { key: "id" }));
            } else {
                setState(
                    "tables",
                    produce((all) => {
                        delete all[refId];
                    }),
                );
            }
        },
        isVisible: (refId, tableId) => !state.hidden[refId]?.[tableId],
        show: (refId, tableId) =>
            setState(
                "hidden",
                produce((hidden) => {
                    delete hidden[refId]?.[tableId];
                }),
            ),
        hide: (refId, tableId) =>
            setState(
                "hidden",
                produce((hidden) => {
                    (hidden[refId] ??= {})[tableId] = true;
                }),
            ),
    };
}
