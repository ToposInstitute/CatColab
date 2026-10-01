export type {
    DocumentChange,
    DocumentRef,
    DocumentStore,
    HandlesByLinkType,
} from "./document-store";
export { documentLinks, emptyHandlesByLinkType, getDocumentSnapshot } from "./document-store";
export { documentCacheFor } from "./document-cache";
export type { DocumentCache } from "./document-cache";
export { validateDocumentStructure } from "./structural-validation";
export { createInMemoryStore } from "./in-memory";
