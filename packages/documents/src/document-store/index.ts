export type {
    DocumentChange,
    DocumentRef,
    DocumentStore,
    HandlesByLinkType,
} from "./document-store";
export {
    documentLinks,
    emptyHandlesByLinkType,
    getDocumentSnapshot,
} from "./document-store";
export { createDocumentSnapshot, createInMemoryStore } from "./in-memory";
