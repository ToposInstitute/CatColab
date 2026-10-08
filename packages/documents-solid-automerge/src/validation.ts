import { type Accessor, createComputed, createSignal, onCleanup, untrack } from "solid-js";
import { createStore, reconcile } from "solid-js/store";

import type {
    Instance,
    InstanceValidation,
    InstanceTable,
    TableIssue,
    ModelValidation,
    Notebook,
    Shape,
} from "catcolab-documents";
import { requireOwner } from "./owner";

function createValidationAccessor<T>(
    subscribe: (callback: (value: T) => void) => () => void,
): Accessor<T | undefined> {
    requireOwner();
    const [validation, setValidation] = createSignal<T>();
    const unsubscribe = subscribe((value) => setValidation(() => value));
    onCleanup(unsubscribe);
    return validation;
}

export function createNotebookValidation<S extends Shape>(
    notebook: Notebook<S>,
): Accessor<ModelValidation<S> | undefined> {
    return createValidationAccessor((callback) => notebook.onValidate(callback));
}

/** Reconcile only published validation data, never current raw rows against an
 * older schema. The immutable result remains available for revision-aware commands. */
export function createInstanceValidationView<H, S extends Shape, V>(instance: Instance<H, S, V>) {
    const validation = createInstanceValidation(instance);
    const [data, setData] = createStore<{
        tables: readonly InstanceTable[];
        issues: readonly TableIssue[];
    }>({
        tables: [],
        issues: [],
    });
    createComputed(() => {
        const current = validation();
        if (!current) {
            return;
        }
        const next = structuredClone({ tables: current.tables, issues: current.issues });
        untrack(() => setData(reconcile(next, { key: "id" })));
    });
    return { validation, data, ready: () => validation() !== undefined };
}

export function createInstanceValidation<H, S extends Shape, V>(
    instance: Instance<S, H, V>,
): Accessor<InstanceValidation<S> | undefined> {
    return createValidationAccessor((callback) => instance.onValidate(callback));
}
