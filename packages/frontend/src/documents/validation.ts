import { type Accessor, createSignal, getOwner, onCleanup } from "solid-js";

import type {
    Instance,
    InstanceValidation,
    ModelValidation,
    Notebook,
    Shape,
} from "catcolab-documents";

function createValidationAccessor<T>(
    subscribe: (callback: (value: T) => void) => () => void,
): Accessor<T | undefined> {
    if (!getOwner()) {
        throw new Error("Validation accessors must be created within a Solid owner.");
    }
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

export function createInstanceValidation<H, S extends Shape, V>(
    instance: Instance<H, S, V>,
): Accessor<InstanceValidation<S> | undefined> {
    return createValidationAccessor((callback) => instance.onValidate(callback));
}
