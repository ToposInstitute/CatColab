import type { Repo } from "@automerge/automerge-repo";

import type { Uuid } from "catlaborator";
import type { RpcClient } from "./rpc";

/** Bundle of everything needed to interact with the CatColab backend. */
export type Api = {
    /** Host part of the URL for the CatColab backend server. */
    serverHost: string;

    /** RPC client for the CatColab backend API. */
    rpc: RpcClient;

    /** Automerge repo connected to the Automerge document server. */
    repo: Repo;
};

/** A stable reference to a document in the database.

Such a reference identifies a specific document, possibly at a specific version.
The keys are prefixed with an underscore, e.g. `_id` instead of `id`, to avoid
conflicts with other keys and unambiguously signal that the ID and other data
apply at the *database* level, rather than merely the *document* level. The same
convention is used in document databases like CouchDB and MongoDB.
 */
export type StableRef = {
    /** Unique identifier of the document. */
    _id: Uuid;

    /** Version of the document.

    If null, refers to the head snapshot of document. This is the case when the
    referenced document will receive live updates.
     */
    _version: string | null;

    /** Server containing the document.

    Assuming one of the official deployments is used, this will be either
    `catcolab.org` or `next.catcolab.org`.
     */
    _server: string;
};

/** Base type for a document persisted in the database. */
export type Document<T extends string> = {
    /** Type of the document, such as "model" or "diagram". */
    type: T;

    /** Human-readable name of the document. */
    name: string;
};

/** A document located within the database. */
export type StableDocument<T extends string> = StableRef & Document<T>;

/** A link from one document to another.

The source of the link is the document containing this data and the target of
link is given by the data itself.
 */
export type Link<T extends string> = StableRef & {
    /** Type of the link, such as "diagramIn" or "analysisOf" .*/
    type: T;
};
