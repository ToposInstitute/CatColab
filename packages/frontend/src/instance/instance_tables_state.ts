import { createContext, useContext } from "solid-js";
import { createStore, produce, reconcile } from "solid-js/store";
import invariant from "tiny-invariant";

/** Minimal description of an instance table, for listing outside the editor. */
export type InstanceTableSummary = {
    id: string;
    label: string | null;
};

/** Page-level UI state for the tables of open instance documents.

Mounted instance editors register their tables here so that the sidebar can list
them, and both sides share which tables are hidden. Keyed by document ref ID.
 */
export type InstanceTablesState = {
    /** Tables registered for a document, or `undefined` if none is mounted. */
    tables: (refId: string) => ReadonlyArray<InstanceTableSummary> | undefined;

    /** Register (or, with `undefined`, unregister) the tables of a document. */
    setTables: (refId: string, tables: ReadonlyArray<InstanceTableSummary> | undefined) => void;

    isVisible: (refId: string, tableId: string) => boolean;
    show: (refId: string, tableId: string) => void;
    hide: (refId: string, tableId: string) => void;
};

export const InstanceTablesContext = createContext<InstanceTablesState>();

export function useInstanceTables(): InstanceTablesState {
    const state = useContext(InstanceTablesContext);
    invariant(state, "Instance tables state must be provided as context");
    return state;
}

export function createInstanceTablesState(): InstanceTablesState {
    const [state, setState] = createStore<{
        tables: Record<string, InstanceTableSummary[]>;
        hidden: Record<string, Record<string, true>>;
    }>({ tables: {}, hidden: {} });

    return {
        tables: (refId) => state.tables[refId],
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
