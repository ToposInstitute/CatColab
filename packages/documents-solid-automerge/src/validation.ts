import { type Accessor, createComputed, createSignal, onCleanup, untrack } from "solid-js";
import { createStore, reconcile } from "solid-js/store";

import type { Instance, InstanceValidation, InstanceTable, TableIssue } from "catcolab-documents";
import { requireOwner } from "./owner";

function createValidationAccessor(
    subscribe: (callback: (validation: InstanceValidation | undefined) => void) => () => void,
): Accessor<InstanceValidation | undefined> {
    requireOwner();
    const [validation, setValidation] = createSignal<InstanceValidation | undefined>();
    const unsubscribe = subscribe((value) => setValidation(() => value));
    onCleanup(unsubscribe);
    return validation;
}

export type InstanceValidationView = {
    data: {
        tables: readonly InstanceTable[];
        issues: readonly TableIssue[];
    };
    ready: Accessor<boolean>;
};

/** Create a fine-grained reactive view of the validation of an instance.
 */
export function createInstanceValidationView(
    instance: Pick<Instance, "onValidate">,
): InstanceValidationView {
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
    return { data, ready: () => validation() !== undefined };
}

function createInstanceValidation(
    instance: Pick<Instance, "onValidate">,
): Accessor<InstanceValidation | undefined> {
    return createValidationAccessor((callback) => instance.onValidate(callback));
}
