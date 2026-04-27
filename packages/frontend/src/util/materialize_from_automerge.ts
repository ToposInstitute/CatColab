import { type Doc, getBackend, getObjectId } from "@automerge/automerge";
import invariant from "tiny-invariant";

/** Materialize an Automerge sub-tree into a plain JavaScript value.

Given an Automerge document root `doc` and any nested proxy `subtree`
reachable from that root, returns a deep, plain-JS copy of the addressed
sub-tree. The result contains no Automerge proxies and is safe to mutate,
pass to `structuredClone`, or store outside an Automerge change callback.

*/
export function materializeFromAutomerge<T>(doc: Doc<unknown>, subtree: T): T {
    const objId = getObjectId(subtree as object);
    invariant(objId, "Value is not an Automerge map or list");
    return getBackend(doc).materialize(objId) as T;
}
