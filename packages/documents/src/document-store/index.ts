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
    createDocumentSnapshot,
} from "./document-store";
export { createInMemoryStore } from "./in-memory";
