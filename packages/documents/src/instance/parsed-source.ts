import type { DocumentSnapshot, DocumentStore } from "../document-store";
import {
    parseInstanceDocument,
    parseInstanceTables,
    type WithIssues,
    type ParsedTables,
} from "./parsed-document";

// Snapshot identity, not ownership or listener order, determines cache validity.
const parsed = new WeakMap<DocumentSnapshot, WithIssues<ParsedTables>>();

export function parsedSnapshotTables(snapshot: DocumentSnapshot): WithIssues<ParsedTables> {
    const cached = parsed.get(snapshot);
    if (cached !== undefined) {
        return cached;
    }
    const result = parseInstanceDocument(snapshot.document);
    const tables: WithIssues<ParsedTables> =
        result.tag === "Err"
            ? {
                  value: parseInstanceTables({}).value,
                  issues: result.content.map((issue) => ({
                      message: `Cannot parse instance document (${issue.path.map(String).join(".")}): ${issue.message}`,
                      path: [],
                  })),
              }
            : {
                  value: result.content.value.tables,
                  issues: result.content.issues.map((issue) => ({
                      message: issue.message,
                      path: issue.path.slice(1),
                  })),
              };
    parsed.set(snapshot, tables);
    return tables;
}

/** Read on demand; no persistent subscription or explicit cache owner is needed. */
export function parsedInstanceTables<Handle, Version>(
    store: DocumentStore<Handle, Version>,
    handle: Handle,
): WithIssues<ParsedTables> {
    return parsedSnapshotTables(store.getDocumentSnapshot(handle));
}
