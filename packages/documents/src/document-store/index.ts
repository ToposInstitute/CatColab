export type {
    DocumentChange,
    DocumentRef,
    DocumentStore,
    HandlesByLinkType,
} from "./document-store";
export { documentLinks, emptyHandlesByLinkType, getDocumentSnapshot } from "./document-store";
export {
    validateInstanceDocumentStructure,
    validateInstanceTablesStructure,
} from "./structural-validation";
export { createInMemoryStore } from "./in-memory";
