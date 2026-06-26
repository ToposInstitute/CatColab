import type { DocumentStore } from "catcolab-documents";
import { v7 } from "uuid";

import type { DblTheory } from "catlog-wasm";

/** A shape as far as theory lookup is concerned: a `theory` id and the core
 * theory its documents elaborate against. */
type ShapeLike = { readonly theory: string; readonly coreTheory?: DblTheory };

/**
 * Build the `linkForHandle`/`getHandle`/`coreTheoryFor` trio a single-document
 * store needs to resolve its *own* notebooks — the contract {@link DocumentStore}
 * now requires, since `validate` resolves a notebook's own model by minting a
 * link to its handle. Each handle is assigned a stable id and registered so the
 * shared recursive elaborator can fetch it back (via `getHandle`, then view its
 * document with the store's own `viewDocument`) and elaborate it against the
 * matching shape's core theory (via `coreTheoryFor`).
 *
 * Used by the test fixtures' stores so a no-instantiation notebook validates
 * (the store can resolve its own handle) without each fixture reimplementing the
 * recursive elaborator.
 */
export function selfResolving<Handle extends WeakKey>(
    shapes: readonly ShapeLike[],
): Pick<DocumentStore<Handle>, "linkForHandle" | "getHandle" | "coreTheoryFor"> {
    const ids = new WeakMap<Handle, string>();
    const byId = new Map<string, Handle>();

    const idFor = (handle: Handle): string => {
        let id = ids.get(handle);
        if (!id) {
            id = v7();
            ids.set(handle, id);
            byId.set(id, handle);
        }
        return id;
    };

    return {
        linkForHandle: (handle) => ({ _id: idFor(handle), _version: null, _server: "" }),
        getHandle: (id) => byId.get(id),
        coreTheoryFor: (theory) => shapes.find((shape) => shape.theory === theory)?.coreTheory,
    };
}
