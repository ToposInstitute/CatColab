// A stand-in for the CatColab backend, modelled on its real RPC surface.
//
// The production backend is reached through a Qubit RPC client (see
// packages/frontend/src/api/rpc.ts and the generated `QubitServer` type in
// packages/backend/pkg/src/index.ts). Every method returns an `RpcResult<T>`,
// a tagged `Ok`/`Err` union, and document reads come back as a `RefDoc`, a
// tagged `Live`/`Readonly` union. We reproduce those shapes here so a store
// backed by this backend has to unwrap them exactly like
// `Api.createDoc`/`Api.fetchDocCacheEntry` do.
//
// The two methods a store uses:
//
//   * `new_ref(content)`: create a document from `content` under a fresh ref id,
//     returning the ref id (the `_id` of a `StableRef`). Analog of
//     `rpc.new_ref.mutate`, called by `Api.createDoc`.
//   * `get_doc(refId)`: resolve a ref id to the Automerge document behind it.
//     Analog of `rpc.get_doc.query`, whose `docId` the frontend then `find`s.
//   * `list_instances(refId)`: ref ids of all instance documents whose
//     `instanceOf` link points back to the given ref. Analog of
//     `rpc.list_instances.query`.
//
// The backend holds its own networked `Repo` in production; here the store and
// backend share one in-memory `Repo`, and every document is served as `Live`
// (the store `find`s it by `docId`).
import { type DocHandle, type DocumentId, Repo } from "@automerge/automerge-repo";
import { v7 } from "uuid";

import type { Document } from "catcolab-document-types";

export type RpcResult<T> =
    | { tag: "Ok"; content: T }
    | { tag: "Err"; code: number; message: string };

export type RefDoc = { tag: "Live"; docId: string; isDeleted: boolean };

export class FakeBackend {
    readonly serverHost = "test.catcolab.org";

    /** The Automerge repo the backend serves documents out of. */
    readonly repo = new Repo();

    /** ref id -> Automerge document id, the mapping `get_doc` serves. */
    private readonly refs = new Map<string, DocumentId>();

    /** ref id -> Automerge document handle, the mapping `list_instances` scans. */
    private readonly docs = new Map<string, DocHandle<Document>>();

    /**
     * Analog of `rpc.new_ref.mutate`: take document *content*, create the repo
     * document backend-side, and return a fresh ref id. This is what
     * `Api.createDoc` calls, and what a store's `createHandle` calls.
     */
    async new_ref(content: Document): Promise<RpcResult<string>> {
        const handle = this.repo.create<Document>(content as Document);
        const refId = v7();
        this.refs.set(refId, handle.documentId);
        this.docs.set(refId, handle);
        return { tag: "Ok", content: refId };
    }

    /** Analog of `rpc.get_doc.query`: ref id -> `RefDoc` (always `Live` here). */
    async get_doc(refId: string): Promise<RpcResult<RefDoc>> {
        const docId = this.refs.get(refId);
        if (!docId) {
            return { tag: "Err", code: 404, message: `Unknown document ${refId}` };
        }
        return { tag: "Ok", content: { tag: "Live", docId, isDeleted: false } };
    }

    /** Analog of `rpc.list_instances.query`: ref ids of the instances of a ref. */
    async list_instances(refId: string): Promise<RpcResult<string[]>> {
        const instances: string[] = [];
        for (const [id, handle] of this.docs) {
            const doc = handle.doc();
            if (doc.type === "instance" && doc.instanceOf._id === refId) {
                instances.push(id);
            }
        }
        return { tag: "Ok", content: instances };
    }
}
