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
} from "./document-store";
export { createInMemoryStore } from "./in-memory";
