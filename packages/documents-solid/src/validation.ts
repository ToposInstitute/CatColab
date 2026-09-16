import { type Accessor, createSignal, getOwner, onCleanup } from "solid-js";

import type {
    Instance,
    InstanceValidation,
    ModelValidation,
    Notebook,
    Shape,
} from "catcolab-documents";

function createValidationAccessor<T>(subscribe: (callback: (value: T) => void) => () => void) {
    if (!getOwner()) {
        throw new Error("Validation accessors must be created within a Solid owner.");
    }
    const [validation, setValidation] = createSignal<T>();
    const unsubscribe = subscribe((value) => setValidation(() => value));
    onCleanup(unsubscribe);
    return validation;
}

/** Reactively validate a notebook within the current Solid owner. */
export function createNotebookValidation<S extends Shape>(
    notebook: Notebook<S>,
): Accessor<ModelValidation<S> | undefined> {
    return createValidationAccessor((callback) => notebook.onValidate(callback));
}

/** Reactively validate an instance within the current Solid owner. */
export function createInstanceValidation<H, S extends Shape, V>(
    instance: Instance<H, S, V>,
): Accessor<InstanceValidation<S> | undefined> {
    return createValidationAccessor((callback) => instance.onValidate(callback));
}
