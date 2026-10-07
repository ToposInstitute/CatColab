import {
    type Accessor,
    createComputed,
    createSignal,
    getOwner,
    onCleanup,
    untrack,
} from "solid-js";
import { createStore, reconcile } from "solid-js/store";

import type { Instance, InstanceTable, InstanceValidation, TableIssue } from "catcolab-documents";

function createValidationAccessor(
    subscribe: (callback: (validation: InstanceValidation | undefined) => void) => () => void,
): Accessor<InstanceValidation | undefined> {
    if (!getOwner()) {
        throw new Error("Validation views must be created within a Solid owner.");
    }
    const [validation, setValidation] = createSignal<InstanceValidation | undefined>();
    const unsubscribe = subscribe((value) => setValidation(() => value));
    onCleanup(unsubscribe);
    return validation;
}

export type InstanceValidationView = {
    data: Pick<InstanceValidation, "tables" | "issues">;
    ready: Accessor<boolean>;
};

/** Create a fine-grained reactive view of the validation of an instance.
 */
export function createInstanceValidationView(
    instance: Pick<Instance, "onValidate">,
): InstanceValidationView {
    const validation = createValidationAccessor((callback) => instance.onValidate(callback));
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
