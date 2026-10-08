import type { DocHandle } from "@automerge/automerge-repo";
import { makeDocumentProjection } from "solid-automerge";
import { createMemo, type Accessor } from "solid-js";
import type { Store } from "solid-js/store";

import { requireOwner } from "./owner";

/** Patch-backed raw reads; subscriptions belong to the current Solid owner. */
export function createAutomergeDocumentView<T extends object>(
    handle: Accessor<DocHandle<T>>,
): Accessor<Store<T>> {
    requireOwner();
    return createMemo(() => makeDocumentProjection(handle()));
}
