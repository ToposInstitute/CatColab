/* This code is expected to be replaced by catlog implementations in the future once a commitment to the mathematical account of instances has been made. */

import type * as DocumentTypes from "catcolab-document-types";
import type { DocumentSnapshot, DocumentStore } from "../document-store";
import type { ModelDocument } from "../model/document";
import type { ModelValidation } from "../model/elaborated-model";
import type { Notebook } from "../model/notebook";
import type { InstanceCapableShape, Shape } from "../shape";
import { validatePathEquations } from "./equation-validation";
import type { InstanceValidation } from "./instance";
import { parsedSnapshotTables } from "./parsed-source";
import { instanceTablesFromModel, readInstancePath, tablesWithOrphanedData } from "./table-methods";

export { atomicTypeOfAttributeType } from "./atomic-types";
import type { FieldPath, TableFieldIssue, TableIssue } from "./errors";
import type { ParsedTables } from "./parsed-document";
import type { InstanceTable, LiteralType, TableHeader } from "./tables";

/** Current-document validation and change callbacks for an instance. */
export interface InstanceValidator<S extends Shape = Shape> {
    validate(): Promise<InstanceValidation<S>>;
    onValidate(callback: (validation: InstanceValidation<S>) => void): () => void;
}

/** Combine schema validation with instance snapshots, retaining coherent
results while schema elaboration is in flight. */
export function createInstanceValidator<Handle, S extends Shape, Version>(
    schema: Notebook<S, ModelDocument, Handle, Version>,
    store: DocumentStore<Handle, Version>,
    handle: Handle,
): InstanceValidator<S> {
    const validations = new WeakMap<
        ModelValidation<S>,
        WeakMap<DocumentSnapshot, InstanceValidation<S>>
    >();

    function validateSnapshot(
        schemaValidation: ModelValidation<S>,
        snapshot = store.getDocumentSnapshot(handle),
    ): InstanceValidation<S> {
        let bySnapshot = validations.get(schemaValidation);
        if (bySnapshot === undefined) {
            bySnapshot = new WeakMap();
            validations.set(schemaValidation, bySnapshot);
        }
        const cached = bySnapshot.get(snapshot);
        if (cached !== undefined) {
            return cached;
        }
        if (schema.shape.supportsInstances === undefined) {
            throw new Error(
                `Shape \`${schema.shape.theory ?? "unnamed"}\` does not support instances`,
            );
        }
        const parsedTables = parsedSnapshotTables(snapshot);
        const schemaTables = instanceTablesFromModel(
            schema.shape as InstanceCapableShape,
            parsedTables.value,
            schemaValidation.model,
        );
        const tables = tablesWithOrphanedData(parsedTables.value, schemaTables);
        const issues = [
            ...parsedTables.issues.map((issue) => ({
                message: issue.message,
                path: issue.path,
                issueType: "MalformedDocument" as const,
            })),
            ...validateInstanceTables(parsedTables.value, schemaTables),
            ...validatePathEquations(tables, schemaValidation.model),
        ];
        const validation: InstanceValidation<S> = {
            modelValidation: schemaValidation,
            tables,
            issues,
            get: (path) => readInstancePath(parsedTables.value, tables, path),
        };
        bySnapshot.set(snapshot, validation);
        return validation;
    }

    return {
        async validate() {
            const snapshot = store.getDocumentSnapshot(handle);
            return validateSnapshot(await schema.validate(), snapshot);
        },
        onValidate(callback) {
            let active = true;
            let latestModelValidation: ModelValidation<S> | undefined;
            let lastPublished: InstanceValidation<S> | undefined;

            function notify(validation: InstanceValidation<S>): void {
                if (active && validation !== lastPublished) {
                    lastPublished = validation;
                    callback(validation);
                }
            }

            const unsubscribeInstance = store.subscribe(handle, (snapshot) => {
                // Retain the previous coherent result while the schema validates.
                if (
                    latestModelValidation?.revision ===
                    store.getDocumentSnapshot(schema.handle).revision
                ) {
                    notify(validateSnapshot(latestModelValidation, snapshot));
                }
            });
            const unsubscribeSchema = schema.onValidate((modelValidation) => {
                if (
                    modelValidation.revision === store.getDocumentSnapshot(schema.handle).revision
                ) {
                    latestModelValidation = modelValidation;
                    notify(validateSnapshot(modelValidation));
                }
            });

            return () => {
                active = false;
                unsubscribeInstance();
                unsubscribeSchema();
            };
        },
    };
}

/** Compare stored data with tables derived from an elaborated schema model.

Stored tables without a schema entity report a single `OrphanedTable` issue;
their rows are not validated further. */
export function validateInstanceTables(
    storedTables: ParsedTables,
    tables: ReadonlyArray<InstanceTable>,
): TableIssue[] {
    const tableById = new Map(tables.map((table) => [table.id, table]));
    const rowTables = new Map<string, Set<string>>();

    for (const [tableId, table] of Object.entries(storedTables)) {
        for (const rowId of Object.keys(table.rows)) {
            const tables = rowTables.get(rowId) ?? new Set<string>();
            tables.add(tableId);
            rowTables.set(rowId, tables);
        }
    }

    const issues: TableIssue[] = [];
    for (const [tableId, storedTable] of Object.entries(storedTables)) {
        const table = tableById.get(tableId);
        if (table === undefined) {
            issues.push({
                message: `Table \`${tableId}\` does not exist in the schema`,
                path: [tableId],
                issueType: "OrphanedTable",
            });
            continue;
        }
        const headerById = new Map(table.headers.map((header) => [header.id, header]));
        for (const [rowId, row] of Object.entries(storedTable.rows)) {
            for (const header of table.headers) {
                if (header.type.tag === "Unknown") {
                    continue;
                }
                const fieldId = header.id;
                const path = fieldPath(tableId, rowId, fieldId);
                const value = row.fields[fieldId] ?? "Null";
                if (value === "Null") {
                    issues.push({
                        message: `\`${header.label}\` in table \`${table.label}\` is missing a value`,
                        path,
                        issueType: "MissingValue",
                    });
                    continue;
                }
                if (header.type.tag === "RowRef") {
                    if (!isStoredRowRef(value)) {
                        issues.push(mistypedLiteralIssue(table, header, path));
                        continue;
                    }
                    const containingTables = rowTables.get(value.RowRef);
                    if (containingTables === undefined) {
                        issues.push({
                            message: `\`${header.label}\` refers to a row that no longer exists`,
                            path,
                            issueType: "DanglingRowRef",
                        });
                    } else if (!containingTables.has(header.type.content.id)) {
                        const actualTableId = containingTables.values().next().value as
                            | string
                            | undefined;
                        let actualLabel = "";
                        if (actualTableId !== undefined) {
                            actualLabel = tableById.get(actualTableId)?.label ?? actualTableId;
                        }
                        const targetLabel =
                            tableById.get(header.type.content.id)?.label ?? header.type.content.id;
                        issues.push({
                            message: `\`${header.label}\` must be a row of table \`${targetLabel}\` (was a row of table \`${actualLabel}\`)`,
                            path,
                            issueType: "MistypedRowRef",
                        });
                    }
                } else if (!storedValueMatchesLiteralType(value, header.type.tag)) {
                    issues.push(mistypedLiteralIssue(table, header, path));
                }
            }
            for (const fieldId of Object.keys(row.fields)) {
                const header = headerById.get(fieldId);
                if (header !== undefined && header.type.tag !== "Unknown") {
                    continue;
                }
                issues.push({
                    message: `Field \`${fieldId}\` in table \`${table.label}\` does not exist in the schema`,
                    path: fieldPath(tableId, rowId, fieldId),
                    issueType: "OrphanedField",
                });
            }
        }
    }
    return issues;
}

function fieldPath(tableId: string, rowId: string, fieldId: string): FieldPath {
    return [tableId, "rows", rowId, "fields", fieldId];
}

function isStoredRowRef(value: DocumentTypes.FieldValue): value is { RowRef: string } {
    return value !== "Null" && "RowRef" in value;
}

function storedValueMatchesLiteralType(
    value: Exclude<DocumentTypes.FieldValue, "Null">,
    type: LiteralType,
): boolean {
    switch (type) {
        case "Bool":
            return "Bool" in value && typeof value.Bool === "boolean";
        case "Int":
            return "Int" in value && Number.isInteger(value.Int);
        case "Float":
            return "Float" in value && Number.isFinite(value.Float);
        case "String":
            return "String" in value && typeof value.String === "string";
    }
}

function mistypedLiteralIssue(
    table: InstanceTable,
    header: TableHeader,
    path: FieldPath,
): TableFieldIssue {
    return {
        message: `\`${header.label}\` in table \`${table.label}\` does not have type ${header.type.tag}`,
        path,
        issueType: "MistypedLiteral",
    };
}
