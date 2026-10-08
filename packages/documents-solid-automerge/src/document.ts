import type { DocHandle } from "@automerge/automerge-repo";
import { makeDocumentProjection } from "solid-automerge";
import { createMemo, type Accessor } from "solid-js";
import type { Store } from "solid-js/store";

import { requireOwner } from "./require_owner";

/** Create a reactive view of an automerge backed document.*/
export function createDocumentView<T extends object>(
    handle: Accessor<DocHandle<T>>,
): Accessor<Store<T>> {
    requireOwner();
    return createMemo(() => makeDocumentProjection(handle()));
}
