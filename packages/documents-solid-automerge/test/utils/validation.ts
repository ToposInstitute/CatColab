import { type Accessor, createSignal, onCleanup } from "solid-js";

import type { ModelValidation, Notebook, Shape } from "catcolab-documents";
import { requireOwner } from "../../src/owner";

export function createNotebookValidation<S extends Shape>(
    notebook: Notebook<S>,
): Accessor<ModelValidation<S> | undefined> {
    requireOwner();
    const [validation, setValidation] = createSignal<ModelValidation<S>>();
    const unsubscribe = notebook.onValidate((value) => setValidation(() => value));
    onCleanup(unsubscribe);
    return validation;
}
