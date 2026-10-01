import type { DocumentStore } from "../document-store";
import {
    parseInstanceDocument,
    parseInstanceTables,
    type WithIssues,
    type ParsedTables,
} from "./parsed-document";

interface Source {
    current: WithIssues<ParsedTables>;
    owners: number;
    unsubscribe: () => void;
}

// Handles need not be objects; scope their identity to the store instead.
const sources = new WeakMap<object, Map<unknown, Source>>();

function parseCurrent<Handle, Version>(
    store: DocumentStore<Handle, Version>,
    handle: Handle,
): WithIssues<ParsedTables> {
    // Do not cache live projections: a later edit could invalidate their
    // invariants before the change callback has rebuilt the parsed view.
    const result = parseInstanceDocument(store.copyValue(handle, store.getDocumentView(handle)));
    if (result.tag === "Err") {
        return {
            value: parseInstanceTables({}).value,
            issues: result.content.map((issue) => ({
                message: `Cannot parse instance document (${issue.path.map(String).join(".")}): ${issue.message}`,
                path: [],
            })),
        };
    }
    return {
        value: result.content.value.tables,
        issues: result.content.issues.map((issue) => ({
            message: issue.message,
            path: issue.path.slice(1),
        })),
    };
}

/** Keep one parsed view up to date for all owners of a store/handle pair. */
export function retainParsedInstance<Handle, Version>(
    store: DocumentStore<Handle, Version>,
    handle: Handle,
): () => void {
    let byHandle = sources.get(store);
    if (byHandle === undefined) {
        byHandle = new Map();
        sources.set(store, byHandle);
    }
    let source = byHandle.get(handle);
    if (source === undefined) {
        source = { current: parseCurrent(store, handle), owners: 0, unsubscribe: () => {} };
        const currentSource = source;
        source.unsubscribe = store.subscribe(handle, () => {
            currentSource.current = parseCurrent(store, handle);
        });
        byHandle.set(handle, source);
    }
    source.owners += 1;
    const retained = source;
    const cache = byHandle;
    let released = false;
    return () => {
        if (released) {
            return;
        }
        released = true;
        retained.owners -= 1;
        if (retained.owners === 0) {
            retained.unsubscribe();
            cache.delete(handle);
        }
    };
}

/** Read the cached view. Standalone readers without an instance owner parse on demand. */
export function parsedInstanceTables<Handle, Version>(
    store: DocumentStore<Handle, Version>,
    handle: Handle,
): WithIssues<ParsedTables> {
    store.getDocumentRevision?.(handle);
    return sources.get(store)?.get(handle)?.current ?? parseCurrent(store, handle);
}
