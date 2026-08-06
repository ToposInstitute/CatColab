import { Attr, AttrType, Entity, Mapping, SimpleSchema } from "catcolab-logics/simple-schema";
import { batch, createSignal } from "solid-js";
import { createStore, reconcile, type SetStoreFunction, unwrap } from "solid-js/store";
import { v7 } from "uuid";

import type { Document } from "catcolab-document-types";
import {
    type NotebookCell,
    CellKind,
    createBinder,
    type DocumentRef,
    type DocumentStore,
    type InstanceDocument,
    type Instance,
    type ModelDocument,
    type Notebook,
    type ObjectCell,
    type Row,
} from "catcolab-documents";
import {
    type FloatToIntegerMigrationPlan,
    type FloatToIntegerRule,
    planFloatToIntegerMigration,
} from "./attribute-type-migration";
import {
    createLocalHistory,
    type LocalHistory,
    pairHistories,
    type PersistedHistory,
} from "./history";

/**
 * The demo's document layer. It owns one schema notebook and one instance drawn
 * over it, backed by a Solid store projection so notebook/instance reads are
 * tracked with fine-grained reactivity.
 */

type SolidStoreHandle = {
    draftDoc: Document;
    docView: Document;
    setDocView: SetStoreFunction<Document>;
    listeners: Set<() => void>;
    ref: DocumentRef;
};

const handleById = new Map<string, SolidStoreHandle>();
let storeBatchDepth = 0;
const pendingStoreHandles = new Set<SolidStoreHandle>();

const publishHandle = (handle: SolidStoreHandle) => {
    handle.setDocView(reconcile(structuredClone(handle.draftDoc), { key: "id" }));
    for (const listener of Array.from(handle.listeners)) {
        listener();
    }
};

/** Publish all document mutations only after a compound operation has finished. */
const runStoreBatch = (mutate: () => void) => {
    storeBatchDepth += 1;
    try {
        mutate();
    } finally {
        storeBatchDepth -= 1;
        if (storeBatchDepth === 0) {
            const handles = Array.from(pendingStoreHandles);
            pendingStoreHandles.clear();
            batch(() => {
                for (const handle of handles) {
                    publishHandle(handle);
                }
            });
        }
    }
};

const solidStore: DocumentStore<SolidStoreHandle> = {
    async createHandle(initialDoc) {
        const id = v7();
        const draftDoc = structuredClone(initialDoc);
        const [docView, setDocView] = createStore<Document>(initialDoc);
        const handle: SolidStoreHandle = {
            draftDoc,
            docView,
            setDocView,
            listeners: new Set(),
            ref: { id, version: null, server: "" },
        };
        handleById.set(id, handle);
        return handle;
    },
    getDocumentView: (handle) => handle.docView,
    changeDocument: (handle, fn) => {
        fn(handle.draftDoc);
        if (storeBatchDepth > 0) {
            pendingStoreHandles.add(handle);
        } else {
            publishHandle(handle);
        }
    },
    subscribe: (handle, callback) => {
        handle.listeners.add(callback);
        return () => {
            handle.listeners.delete(callback);
        };
    },
    copyValue: (_handle, value) => structuredClone(unwrap(value)),
    getDocumentRef: (handle) => handle.ref,
    getHandle: async (ref) => {
        const handle = handleById.get(ref.id);
        return handle
            ? { tag: "Ok", content: handle }
            : {
                  tag: "Err",
                  content: [{ message: `Cannot resolve reference "${ref.id}".`, path: ["id"] }],
              };
    },
};

const solidBinder = createBinder(solidStore);

/** The scalar attribute types supported by instance table cells. */
export const ATTR_TYPE_NAMES = ["String", "Boolean", "Integer", "Float"] as const;
export type AttrTypeName = (typeof ATTR_TYPE_NAMES)[number];

export type DemoDocument = {
    schema: Notebook<typeof SimpleSchema, SolidStoreHandle>;
    instance: Instance<(typeof SimpleSchema)["Instance"], SolidStoreHandle>;
    /** The fixed scalar attribute-type cells, keyed by name. */
    attrTypes: Record<AttrTypeName, NotebookCell<typeof AttrType>>;
    /** Read in a reactive scope to re-run when the schema changes. */
    trackSchema: () => number;
    /** Read in a reactive scope to re-run when the instance changes. */
    trackInstance: () => number;
    /** Snapshot history for the schema document, driving its sidebar. */
    schemaHistory: LocalHistory;
    /** Snapshot history for the instance document, driving its sidebar. */
    instanceHistory: LocalHistory;
    /** Apply a reviewed Float-to-Integer schema and data migration atomically. */
    applyFloatToIntegerMigration: (
        attribute: NotebookCell<typeof Attr>,
        rule: FloatToIntegerRule,
        values?: ReadonlyMap<string, number | undefined>,
    ) => FloatToIntegerMigrationPlan;
    /** Wipe the persisted schema + instance and reload the page from scratch. */
    clear: () => void;
    /** Persistence failure that needs user recovery, if any. */
    storageProblem: () => string | undefined;
};

/** The localStorage key under which the demo's schema + instance are persisted. */
const STORAGE_KEY = "catcolab-instances-demo";

/** The persisted shape: a dumped schema model document and instance document. */
type PersistedState = {
    schema: ModelDocument;
    instance: InstanceDocument;
    /** The schema document's snapshot history, so undo/redo survive a reload. */
    schemaHistory?: PersistedHistory<ModelDocument>;
    /** The instance document's snapshot history, so undo/redo survive a reload. */
    instanceHistory?: PersistedHistory<InstanceDocument>;
};

type LoadedPersistedState = {
    state?: PersistedState;
    problem?: string;
};

function storageProblem(action: string, error?: unknown) {
    const detail = error instanceof Error ? ` ${error.message}` : "";
    return `Could not ${action} local storage.${detail}`;
}

/** Replace every property so rollback cannot retain keys absent from the snapshot. */
function replaceDocument(target: Document, snapshot: Document) {
    const record = target as unknown as Record<string, unknown>;
    for (const key of Object.keys(record)) {
        delete record[key];
    }
    Object.assign(target, structuredClone(snapshot));
}

/** Read persisted state from localStorage, or `undefined` if none/invalid. */
function loadPersisted(): LoadedPersistedState {
    let raw: string | null;
    try {
        raw = localStorage.getItem(STORAGE_KEY);
    } catch (error) {
        return { problem: storageProblem("read", error) };
    }
    if (!raw) {
        return {};
    }
    try {
        return { state: JSON.parse(raw) as PersistedState };
    } catch (error) {
        return { problem: storageProblem("load", error) };
    }
}

/**
 * Look up the fixed scalar attribute-type cells by name in a schema, adding any
 * that are missing. A freshly created schema has none; a reloaded one already
 * carries them (they are ordinary AttrType objects), so we reuse those.
 */
function ensureAttrTypes(
    schema: Notebook<typeof SimpleSchema>,
): Record<AttrTypeName, NotebookCell<typeof AttrType>> {
    const existing = schema.cellsOf(AttrType);
    const find = (name: AttrTypeName) => existing.find((c) => c.label === name);
    return {
        String: find("String") ?? schema.add(AttrType, { label: "String" }),
        Boolean: find("Boolean") ?? schema.add(AttrType, { label: "Boolean" }),
        Integer: find("Integer") ?? schema.add(AttrType, { label: "Integer" }),
        Float: find("Float") ?? schema.add(AttrType, { label: "Float" }),
    };
}

/** Build the schema + instance and wire their change signals. */
export async function createDemoDocument(): Promise<DemoDocument> {
    const loadedPersisted = loadPersisted();
    const [storageProblemMessage, setStorageProblemMessage] = createSignal(loadedPersisted.problem);
    const persisted = loadedPersisted.state;
    let persistenceBlocked = Boolean(loadedPersisted.problem);

    // A state persisted before the tables-array instance representation (the
    // retired flat-triples and notebook-of-tables shapes) has no `tables` on
    // its instance. `loadInstance` discards such a dump and starts a fresh
    // instance; the instance history must go with it, since its snapshots use
    // the old shape.
    if (persisted && !("tables" in (persisted.instance ?? {}))) {
        delete persisted.instanceHistory;
    }

    let schema: Notebook<typeof SimpleSchema>;
    let instance: Instance;
    let attrTypes: Record<AttrTypeName, NotebookCell<typeof AttrType>>;
    let restoredPersistedState = false;
    if (persisted) {
        try {
            const loaded = await solidBinder.loadNotebook(SimpleSchema, persisted.schema);
            if (loaded.tag === "Ok") {
                schema = loaded.content;
                instance = await solidBinder.loadInstance(schema, persisted.instance);
                attrTypes = ensureAttrTypes(schema);
                restoredPersistedState = true;
            } else {
                throw new Error("Stored schema no longer matches the expected shape.");
            }
        } catch (error) {
            setStorageProblemMessage(storageProblem("load", error));
            persistenceBlocked = true;
            schema = await solidBinder.createNotebook(SimpleSchema, { title: "Schema" });
            instance = await solidBinder.createInstance(schema, { title: "Instance" });
            attrTypes = ensureAttrTypes(schema);
        }
    } else {
        schema = await solidBinder.createNotebook(SimpleSchema, { title: "Schema" });
        instance = await solidBinder.createInstance(schema, { title: "Instance" });
        attrTypes = ensureAttrTypes(schema);
    }

    const [schemaVersion, setSchemaVersion] = createSignal(0);
    const [instanceVersion, setInstanceVersion] = createSignal(0);

    // The latest persisted history states, kept here so the single `persist()`
    // below writes them alongside the document dumps. They are updated by each
    // history's `onChange`, and seeded from any persisted state so a reload
    // resumes the existing chain rather than starting a fresh one.
    let schemaHistoryState: PersistedHistory<ModelDocument> | undefined = restoredPersistedState
        ? persisted?.schemaHistory
        : undefined;
    let instanceHistoryState: PersistedHistory<InstanceDocument> | undefined =
        restoredPersistedState ? persisted?.instanceHistory : undefined;

    /** Persist the current schema + instance dumps (and histories) to localStorage. */
    const persist = () => {
        if (persistenceBlocked) {
            return;
        }
        try {
            const state: PersistedState = {
                schema: schema.dump(),
                instance: instance.dump(),
                ...(schemaHistoryState ? { schemaHistory: schemaHistoryState } : {}),
                ...(instanceHistoryState ? { instanceHistory: instanceHistoryState } : {}),
            };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        } catch (error) {
            setStorageProblemMessage(storageProblem("save to", error));
        }
    };

    // Coalesce the expensive per-change side effects. A single scripted run can
    // fire `onChange` hundreds of times synchronously (one per added cell/row and
    // per attribute set); doing a full `persist()` (dump + stringify + write) and
    // bumping the reactive signals on *every* one is O(N²) and thrashes the UI.
    // Instead each change only marks what is dirty and schedules one flush on the
    // next microtask, so a burst collapses into a single persist and a single UI
    // update once the burst settles. Individual interactive edits (which are not
    // in a burst) still flush on the very next tick, so they feel immediate.
    //
    let schemaDirty = false;
    let instanceDirty = false;
    let flushScheduled = false;
    // Set around a history restore so the change it provokes is persisted and
    // reflected in the UI, but not recorded as a *new* snapshot (which would
    // branch history on every undo/redo). The history's own `record` guard runs
    // synchronously inside `restore`; because we defer `record` to the flush,
    // which runs after `restore` returns, we must suppress recording here too.
    let restoring = false;

    const flush = () => {
        flushScheduled = false;
        const schemaChanged = schemaDirty;
        const instanceChanged = instanceDirty;
        schemaDirty = false;
        instanceDirty = false;
        if (!schemaChanged && !instanceChanged) {
            return;
        }
        // One persist for the whole burst, then bump each dirty signal once so
        // reactive consumers re-read exactly once.
        persist();
        if (schemaChanged) {
            setSchemaVersion((v) => v + 1);
        }
        if (instanceChanged) {
            setInstanceVersion((v) => v + 1);
        }
        // History recording is itself debounced, so a burst of changes still
        // records a single snapshot once edits pause. Skip it entirely while a
        // restore is in flight, so navigating history does not branch it.
        if (!restoring) {
            if (schemaChanged) {
                schemaHistory.record();
            }
            if (instanceChanged) {
                instanceHistory.record();
            }
        }
    };

    const scheduleFlush = () => {
        if (flushScheduled) {
            return;
        }
        flushScheduled = true;
        queueMicrotask(flush);
    };

    // Snapshot history for each document. A snapshot is a detached dump; a
    // restore writes it back onto the live draft through the Solid store, so every
    // reactive consumer (and the other document, for the schema) re-renders
    // exactly as it does on an ordinary edit.
    // Each history is seeded from, and persisted back into, localStorage so the
    // undo/redo chain survives a reload.
    //
    // A restore flushes synchronously (with `restoring` set, so no new snapshot is
    // recorded) rather than through the deferred microtask, so the UI reflects the
    // restored state immediately on undo/redo.
    const runRestore = (mutate: () => void) => {
        restoring = true;
        try {
            mutate();
            flush();
        } finally {
            restoring = false;
        }
    };
    const schemaHistory = createLocalHistory<ModelDocument>({
        capture: () => schema.dump(),
        restore: (snapshot) => {
            runRestore(() => {
                solidStore.changeDocument(schema.handle, (doc) => {
                    replaceDocument(doc, snapshot);
                });
            });
        },
        equal: (a, b) => JSON.stringify(a) === JSON.stringify(b),
        ...(schemaHistoryState ? { initial: schemaHistoryState } : {}),
        onChange: (state) => {
            schemaHistoryState = state;
            persist();
        },
    });
    const instanceHistory = createLocalHistory<InstanceDocument>({
        capture: () => instance.dump(),
        restore: (snapshot) => {
            runRestore(() => {
                solidStore.changeDocument(instance.handle, (doc) => {
                    replaceDocument(doc, snapshot);
                });
            });
        },
        equal: (a, b) => JSON.stringify(a) === JSON.stringify(b),
        ...(instanceHistoryState ? { initial: instanceHistoryState } : {}),
        onChange: (state) => {
            instanceHistoryState = state;
            persist();
        },
    });

    // A schema edit can invalidate the instance (e.g. a mapping's codomain
    // changing), so mark the instance dirty too when the schema changes.
    schema.onChange(() => {
        schemaDirty = true;
        instanceDirty = true;
        scheduleFlush();
    });
    instance.onChange(() => {
        instanceDirty = true;
        scheduleFlush();
    });

    // Persist the initial state so a first-run demo is saved even before an edit.
    persist();
    // Seed each history with the initial state so there is always a snapshot to
    // return to. Immediate (not debounced): the seed must exist right away. On a
    // reload this is a no-op — the resumed chain's current entry already equals
    // the loaded document state, so `recordNow` records nothing.
    schemaHistory.recordNow();
    instanceHistory.recordNow();

    const pairedSchemaHistory = pairHistories(schemaHistory, instanceHistory);
    const pairedInstanceHistory = pairHistories(instanceHistory, schemaHistory);

    const applyFloatToIntegerMigration = (
        attribute: NotebookCell<typeof Attr>,
        rule: FloatToIntegerRule,
        values?: ReadonlyMap<string, number | undefined>,
    ): FloatToIntegerMigrationPlan => {
        const plan = planFloatToIntegerMigration({ instance }, attribute, rule);
        const hasCompleteValues =
            values !== undefined &&
            plan.rows.every((row) => {
                if (!values.has(row.rowId)) {
                    return false;
                }
                const value = values.get(row.rowId);
                return (
                    value === undefined ||
                    (Number.isInteger(value) && value >= -2_147_483_648 && value <= 2_147_483_647)
                );
            });
        if (values !== undefined && !hasCompleteValues) {
            throw new Error("The edited migration values are incomplete or invalid.");
        }
        if (values === undefined && !plan.canApply) {
            throw new Error("The Float-to-Integer migration has unresolved values.");
        }

        // Finish any edits pending in the history debounce before establishing
        // the shared migration boundary.
        flush();
        schemaHistory.recordNow();
        instanceHistory.recordNow();

        const schemaBefore = schema.dump();
        const instanceBefore = instance.dump();
        runStoreBatch(() => {
            try {
                attribute.update({ to: attrTypes.Integer });
                for (const row of plan.rows) {
                    if (values?.has(row.rowId)) {
                        row.row.set(attribute, values.get(row.rowId));
                    } else if (row.classification === "converted") {
                        row.row.set(attribute, row.output);
                    } else if (row.classification === "cleared") {
                        row.row.set(attribute, undefined);
                    }
                }
            } catch (error) {
                solidStore.changeDocument(schema.handle, (doc) => {
                    replaceDocument(doc, schemaBefore);
                });
                solidStore.changeDocument(instance.handle, (doc) => {
                    replaceDocument(doc, instanceBefore);
                });
                throw error;
            }
        });

        // Listener notifications were published together; flush their signals
        // now and replace the normal debounced entries with linked checkpoints.
        flush();
        const groupId = v7();
        schemaHistory.recordNow(groupId);
        instanceHistory.recordNow(groupId);
        return plan;
    };

    return {
        schema,
        instance,
        attrTypes,
        trackSchema: schemaVersion,
        trackInstance: instanceVersion,
        schemaHistory: pairedSchemaHistory,
        instanceHistory: pairedInstanceHistory,
        applyFloatToIntegerMigration,
        storageProblem: storageProblemMessage,
        clear: () => {
            // Remove the persisted schema + instance and every key derived from
            // the demo's prefix (the schema/instance script sources), so resetting
            // clears the scripts too.
            try {
                for (const key of Object.keys(localStorage)) {
                    if (key === STORAGE_KEY || key.startsWith(`${STORAGE_KEY}:`)) {
                        localStorage.removeItem(key);
                    }
                }
                location.reload();
            } catch (error) {
                setStorageProblemMessage(storageProblem("clear", error));
            }
        },
    };
}

/** The formal cell kinds this simple-schema notebook shows. */
export type SchemaCellKind = "entity" | "mapping" | "attr" | "attrType";

/** A formal cell of the schema notebook, as returned by {@link schemaCells}. */
export type SchemaCell = ReturnType<Notebook<typeof SimpleSchema>["formalCells"]>[number];

/** The human tag shown at the right of a schema cell, matching CatColab. */
export const SCHEMA_CELL_LABEL: Record<SchemaCellKind, string> = {
    entity: "Entity",
    mapping: "Mapping",
    attr: "Attribute",
    attrType: "Attribute type",
};

/**
 * Classify a schema notebook cell by its definition.
 *
 * A cell's stored `type` is reconstructed from storage and is *not* referentially
 * equal to the `Entity`/`Mapping`/… defs, so we classify by structural membership
 * via `cellsOf` (the same matching the rest of the demo relies on), comparing by
 * cell id.
 */
export function schemaCellKind(doc: DemoDocument, cell: SchemaCell): SchemaCellKind | undefined {
    if (cell.kind === CellKind.Object) {
        if (doc.schema.cellsOf(Entity).some((c) => c.id === cell.id)) {
            return "entity";
        }
        if (doc.schema.cellsOf(AttrType).some((c) => c.id === cell.id)) {
            return "attrType";
        }
    }
    if (cell.kind === CellKind.Morphism) {
        if (doc.schema.cellsOf(Mapping).some((c) => c.id === cell.id)) {
            return "mapping";
        }
        if (doc.schema.cellsOf(Attr).some((c) => c.id === cell.id)) {
            return "attr";
        }
    }
    return undefined;
}

/** Every formal cell of the schema, in notebook (insertion) order. */
export function schemaCells(doc: DemoDocument): SchemaCell[] {
    return doc.schema.formalCells();
}

/** Every entity (user-defined object) cell in the schema, in notebook order. */
export function entityCells(doc: DemoDocument): NotebookCell<typeof Entity>[] {
    return doc.schema.cellsOf(Entity);
}

/** Every mapping (entity -> entity) cell in the schema. */
export function mappingCells(doc: DemoDocument) {
    return doc.schema.cellsOf(Mapping);
}

/** Every attribute (entity -> AttrType) cell in the schema. */
export function attrCells(doc: DemoDocument) {
    return doc.schema.cellsOf(Attr);
}

/** All rows of an entity in the instance. */
export function rowsOf(doc: DemoDocument, entity: ObjectCell): Row[] {
    return doc.instance.rowsOf(entity);
}

export { CellKind };
