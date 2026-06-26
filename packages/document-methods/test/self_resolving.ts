import { type DocumentStore, resolveModelWith } from "catcolab-documents";
import { v7 } from "uuid";

import type { ModelDocument } from "catcolab-document-methods";
import type { Link } from "catcolab-document-types";
import type { DblTheory } from "catlog-wasm";

/** A shape as far as theory lookup is concerned: a `theory` id and the core
 * theory its documents elaborate against. */
type ShapeLike = { readonly theory: string; readonly coreTheory?: DblTheory };

/**
 * Build the `linkForHandle`/`resolveModel` pair a single-document store needs to
 * resolve its *own* notebooks — the contract {@link DocumentStore.resolveModel}
 * now requires, since `validate` resolves a notebook's own model by minting a
 * link to its handle. Each handle is assigned a stable id and registered so the
 * shared {@link resolveModelWith} elaborator can fetch it back and elaborate it
 * against the matching shape's core theory.
 *
 * Used by the test fixtures' stores so a no-instantiation notebook validates
 * (the store can resolve its own handle) without each fixture reimplementing the
 * recursive elaborator.
 */
export function selfResolving<Handle extends WeakKey>(
    viewDocument: (handle: Handle) => ModelDocument,
    shapes: readonly ShapeLike[],
): Pick<DocumentStore<Handle>, "linkForHandle" | "resolveModel"> {
    const ids = new WeakMap<Handle, string>();
    const byId = new Map<string, ModelDocument>();

    const idFor = (handle: Handle): string => {
        let id = ids.get(handle);
        if (!id) {
            id = v7();
            ids.set(handle, id);
            byId.set(id, viewDocument(handle));
        }
        return id;
    };

    return {
        linkForHandle: (handle) => ({ _id: idFor(handle), _version: null, _server: "" }),
        resolveModel: (link: Link) =>
            resolveModelWith(
                {
                    getDocument: (id) => byId.get(id),
                    coreTheoryFor: (theory) =>
                        shapes.find((shape) => shape.theory === theory)?.coreTheory,
                },
                link,
            ),
    };
}
