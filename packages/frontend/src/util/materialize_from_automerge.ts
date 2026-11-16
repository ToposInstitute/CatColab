import { type Doc, getBackend, getObjectId } from "@automerge/automerge";
import { unwrap } from "solid-js/store";

/** Materialize an Automerge sub-tree into a plain JavaScript value.

Given an Automerge document root `doc` and any nested proxy `subtree`
reachable from that root, returns a deep, plain-JS copy of the addressed
sub-tree. The result contains no Automerge proxies and is safe to mutate,
pass to `structuredClone`, or store outside an Automerge change callback.

A `subtree` that is already plain, as when read from a store holding a copy of
the document, is copied as is.
*/
export function materializeFromAutomerge<T>(doc: Doc<unknown>, subtree: T): T {
    const objId = getObjectId(subtree);
    if (!objId) {
        return structuredClone(unwrap(subtree));
    }
    return getBackend(doc).materialize(objId) as T;
}
