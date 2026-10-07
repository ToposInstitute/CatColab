export type {
    DocumentChange,
    DocumentRef,
    DocumentStore,
    DocumentSnapshot,
    DeepReadonly,
    HandlesByLinkType,
} from "./document-store";
export {
    documentLinks,
    emptyHandlesByLinkType,
    getDocumentSnapshot,
    createDocumentSnapshot,
    createSnapshotReader,
} from "./document-store";
export { createInMemoryStore } from "./in-memory";
