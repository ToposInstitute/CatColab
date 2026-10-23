import type { InstanceDocument } from "catcolab-document-methods";
import type { FieldValue, Link } from "catcolab-document-types";
import type { DocumentStore } from "../document-store";
import type { StructuralIssue, StructurallyValid, WithIssues } from "../document/parse-structure";
import type { Result } from "../result";
import type { DeepReadonly } from "../util/deep-readonly";
import { parseInstanceStructure } from "./parse-structure";

/** A stored field value, without validation metadata or resolved row references. */
export type FieldValueData = DeepReadonly<FieldValue>;

/** Row data, keyed by stored field id. */
export interface RowData {
    readonly id: string;
    readonly fields: Readonly<Record<string, FieldValueData>>;
}

/** Table data with rows in reconciled stored order. */
export interface TableData {
    readonly id: string;
    readonly rows: readonly RowData[];
}

/** Instance data, independent of schema validation. */
export interface InstanceData {
    readonly type: "instance";
    readonly name: string;
    readonly instanceOf: DeepReadonly<Link>;
    readonly tables: readonly TableData[];
}

type InstanceParseResult = Result<WithIssues<InstanceData>, readonly StructuralIssue[]>;

const dataCache = new WeakMap<DeepReadonly<object>, InstanceParseResult>();

/** Read instance data and issues, caching by snapshot identity. */
export function getInstanceData<Handle, Version>(
    store: DocumentStore<Handle, Version>,
    handle: Handle,
): InstanceParseResult {
    return parseInstanceData(store.getDocumentSnapshot(handle));
}

/** Parse an instance document snapshot. */
export function parseInstanceData(snapshot: DeepReadonly<object>): InstanceParseResult {
    let result = dataCache.get(snapshot);
    if (result === undefined) {
        result = parseInstanceDataValue(snapshot);
        dataCache.set(snapshot, result);
    }
    return result;
}

function parseInstanceDataValue(document: DeepReadonly<object>): InstanceParseResult {
    if (!("type" in document) || document.type !== "instance") {
        return {
            tag: "Err",
            content: [{ message: "Expected an instance document", path: ["type"] }],
        };
    }
    const result = parseInstanceStructure(document as DeepReadonly<InstanceDocument>);
    return {
        tag: "Ok",
        content: {
            value: buildInstanceData(result.value),
            issues: result.issues,
        },
    };
}

function buildInstanceData(document: StructurallyValid<InstanceDocument>): InstanceData {
    return {
        type: "instance",
        name: document.name,
        instanceOf: document.instanceOf,
        tables: Object.entries(document.tables).map(([id, table]) => ({
            id,
            rows: table.rowOrder.map((id) => ({
                id,
                fields: table.rows[id]!.fields,
            })),
        })),
    };
}
