import { v7 as uuid } from "uuid";

import type { InstanceDocument } from "catcolab-document-methods";
import type * as DocumentTypes from "catcolab-document-types";
import type { QualifiedLabel } from "catlog-wasm";
import type { DocumentStore } from "../document-store";
import type { ElaboratedModel, ObjectJudgment } from "../model/elaborated-model";
import type { Issue, Result } from "../result";
import type { InstanceCapableShape, ObjectType, Shape } from "../shape";
import type { FieldPath } from "./errors";
import type {
    FieldValue,
    InstancePath,
    InstanceTable,
    LiteralValue,
    TableHeader,
    TableRow,
} from "./tables";
import { atomicTypeOfAttributeType } from "./validation";

/** Read one table, row, or field from prepared tables.

Addressing failures are reported as issues. */
export function readInstancePath<Handle>(
    store: DocumentStore<Handle>,
    handle: Handle,
    tables: ReadonlyArray<InstanceTable>,
    path: InstancePath,
): Result<InstanceTable | TableRow | FieldValue> {
    const tableById = new Map(tables.map((table) => [table.id, table]));
    const document = store.getDocumentView(handle) as Readonly<InstanceDocument>;
    const [tableId, rowsSegment, rowId, fieldsSegment, fieldId, ...rest] = path;
    const table = tableById.get(tableId);
    if (table === undefined) {
        return pathError(`Table \`${tableId}\` does not exist`);
    }
    if (path.length === 1) {
        return { tag: "Ok", content: table };
    }
    if (rowsSegment !== "rows" || rowId === undefined) {
        return pathError("An instance path after a table must address a row");
    }
    const storedRow = document.tables[tableId]?.rows[rowId];
    if (storedRow === undefined) {
        return pathError(`Row \`${rowId}\` does not exist in table \`${tableId}\``);
    }
    const row = makeRow(store, handle, table, rowId);
    if (path.length === 3) {
        return { tag: "Ok", content: row };
    }
    if (fieldsSegment !== "fields" || fieldId === undefined || rest.length > 0) {
        return pathError("An instance path after a row must address a field");
    }
    if (!table.headers.some((header) => header.id === fieldId)) {
        return pathError(`Field \`${fieldId}\` does not exist in table \`${tableId}\``);
    }
    const stored = storedRow.fields[fieldId] ?? "Null";
    return {
        tag: "Ok",
        content: fieldValueFromStored([tableId, "rows", rowId, "fields", fieldId], stored),
    };
}

/** Add rows using a validated schema model.

Only addressing failures are reported as issues. Every update that fails to
address is skipped and the rest are still applied. */
export function addInstanceRowsToStore<Handle>(
    shape: InstanceCapableShape,
    store: DocumentStore<Handle>,
    handle: Handle,
    schemaModel: ElaboratedModel<Shape>,
    additions: ReadonlyArray<{
        table: InstanceTable;
        values: ReadonlyArray<Record<string, LiteralValue | TableRow>>;
    }>,
): Result<ReadonlyArray<TableRow>> {
    const schemaTables = instanceTablesFromModel(shape, store, handle, schemaModel);
    const schemaTableById = new Map(
        schemaTables.map((schemaTable) => [schemaTable.id, schemaTable]),
    );

    const issues: Issue[] = [];
    const addedRows: Array<{ schemaTable: InstanceTable; id: string }> = [];

    store.changeDocument(handle, (changedDocument) => {
        const instanceDocument = changedDocument as InstanceDocument;
        for (const { table, values } of additions) {
            const schemaTable = schemaTableById.get(table.id);
            if (schemaTable === undefined) {
                issues.push({
                    message: `Table \`${table.id}\` does not exist in the current schema`,
                });
                continue;
            }
            for (const rowValues of values) {
                const fields = encodeFieldsByLabel(schemaTable, rowValues, issues);
                const id = freshRowId(instanceDocument);
                const storedTable = instanceDocument.tables[schemaTable.id];
                if (storedTable === undefined) {
                    instanceDocument.tables[schemaTable.id] = {
                        rows: { [id]: { fields } },
                        rowOrder: [id],
                    };
                } else {
                    storedTable.rows[id] = { fields };
                    storedTable.rowOrder.push(id);
                }
                addedRows.push({ schemaTable, id });
            }
        }
    });

    if (issues.length > 0) {
        return { tag: "Err", content: issues };
    }
    return {
        tag: "Ok",
        content: addedRows.map(({ schemaTable, id }) => makeRow(store, handle, schemaTable, id)),
    };
}

/** Update fields by header label using a validated schema model.

Only addressing failures are reported as issues. Every update that fails to
address is skipped and the rest are still applied. */
export function updateInstanceFieldsByLabelInStore<Handle>(
    shape: InstanceCapableShape,
    store: DocumentStore<Handle>,
    handle: Handle,
    schemaModel: ElaboratedModel<Shape>,
    updates: ReadonlyArray<{
        row: TableRow;
        values: ReadonlyArray<Record<string, LiteralValue | TableRow>>;
    }>,
): Result<void> {
    const schemaTables = instanceTablesFromModel(shape, store, handle, schemaModel);

    const issues: Issue[] = [];
    store.changeDocument(handle, (changedDocument) => {
        const instanceDocument = changedDocument as InstanceDocument;
        for (const { row, values } of updates) {
            const schemaTable = schemaTableForRow(instanceDocument, schemaTables, row, issues);
            if (schemaTable === undefined) {
                continue;
            }
            const storedRow = instanceDocument.tables[schemaTable.id]?.rows[row.id];
            if (storedRow === undefined) {
                continue;
            }
            for (const rowValues of values) {
                Object.assign(
                    storedRow.fields,
                    encodeFieldsByLabel(schemaTable, rowValues, issues),
                );
            }
        }
    });

    return issues.length > 0 ? { tag: "Err", content: issues } : { tag: "Ok", content: undefined };
}

/** Update one field by header id using a validated schema model.

Only addressing failures (an unknown row or an unknown field) are reported as
issues. */
export function updateInstanceFieldByIdInStore<Handle>(
    shape: InstanceCapableShape,
    store: DocumentStore<Handle>,
    handle: Handle,
    schemaModel: ElaboratedModel<Shape>,
    row: TableRow,
    field: { id: string },
    value: LiteralValue | TableRow,
): Result<void> {
    const schemaTables = instanceTablesFromModel(shape, store, handle, schemaModel);

    const issues: Issue[] = [];
    store.changeDocument(handle, (changedDocument) => {
        const instanceDocument = changedDocument as InstanceDocument;
        const schemaTable = schemaTableForRow(instanceDocument, schemaTables, row, issues);
        if (schemaTable === undefined) {
            return;
        }
        const storedRow = instanceDocument.tables[schemaTable.id]?.rows[row.id];
        if (storedRow === undefined) {
            return;
        }
        const header = schemaTable.headers.find((header) => header.id === field.id);
        if (header === undefined) {
            issues.push({
                message: `Field \`${field.id}\` is not a header of table \`${schemaTable.label}\``,
            });
            return;
        }
        storedRow.fields[field.id] = encodeFieldValue(header, value);
    });

    return issues.length > 0 ? { tag: "Err", content: issues } : { tag: "Ok", content: undefined };
}

function freshRowId(document: Readonly<InstanceDocument>): string {
    let id = uuid();
    while (Object.values(document.tables).some((table) => table.rows[id] !== undefined)) {
        id = uuid();
    }
    return id;
}

function schemaTableForRow(
    document: Readonly<InstanceDocument>,
    schemaTables: readonly InstanceTable[],
    row: TableRow,
    issues: Issue[],
): InstanceTable | undefined {
    const containingTables = schemaTables.filter(
        (schemaTable) => document.tables[schemaTable.id]?.rows[row.id] !== undefined,
    );
    if (containingTables.length === 0) {
        issues.push({ message: `Row \`${row.id}\` does not exist` });
        return undefined;
    }
    if (containingTables.length > 1) {
        issues.push({ message: `Row \`${row.id}\` occurs in more than one table` });
        return undefined;
    }
    return containingTables[0];
}

function encodeFieldsByLabel(
    schemaTable: InstanceTable,
    fields: Record<string, LiteralValue | TableRow>,
    issues: Issue[],
): Record<string, DocumentTypes.FieldValue> {
    const encoded: Record<string, DocumentTypes.FieldValue> = {};
    for (const [label, value] of Object.entries(fields)) {
        const matching = schemaTable.headers.filter((header) => header.label === label);
        if (matching.length === 0) {
            issues.push({
                message: `Table \`${schemaTable.label}\` has no column labeled \`${label}\``,
            });
            continue;
        }
        if (matching.length > 1) {
            issues.push({
                message: `Column label \`${label}\` is ambiguous in table \`${schemaTable.label}\``,
            });
            continue;
        }
        const header = matching[0]!;
        encoded[header.id] = encodeFieldValue(header, value);
    }
    return encoded;
}

/* This function follows the run-time shape of the given value, with the one
   exception carved out for Int vs Float which we can't determine.*/
function encodeFieldValue(
    header: TableHeader,
    value: LiteralValue | TableRow,
): DocumentTypes.FieldValue {
    if (value === null) {
        return "Null";
    }
    if (typeof value === "boolean") {
        return { Bool: value };
    }
    if (typeof value === "string") {
        return { String: value };
    }
    if (typeof value === "number") {
        return header.type.tag === "Int" ? { Int: value } : { Float: value };
    }
    return { RowRef: value.id };
}

function requireRawRow(
    document: Readonly<InstanceDocument>,
    tableId: string,
    rowId: string,
): Readonly<DocumentTypes.TableRow> {
    const row = document.tables[tableId]?.rows[rowId];
    if (row === undefined) {
        throw new Error(`Row \`${rowId}\` does not exist in table \`${tableId}\``);
    }
    return row;
}

function makeRow<Handle>(
    store: DocumentStore<Handle>,
    handle: Handle,
    schemaTable: InstanceTable,
    rowId: string,
): TableRow {
    return {
        id: rowId,
        get index() {
            const document = store.getDocumentView(handle) as Readonly<InstanceDocument>;
            return orderedRowIds(document.tables[schemaTable.id]).indexOf(rowId);
        },
        get fields() {
            const document = store.getDocumentView(handle) as Readonly<InstanceDocument>;
            const storedRow = requireRawRow(document, schemaTable.id, rowId);
            return schemaTable.headers.map((header) =>
                fieldValueFromStored(
                    [schemaTable.id, "rows", rowId, "fields", header.id],
                    storedRow.fields[header.id] ?? "Null",
                ),
            );
        },
    };
}

function makeTable<Handle>(
    store: DocumentStore<Handle>,
    handle: Handle,
    id: string,
    label: string | null,
    headers: ReadonlyArray<TableHeader>,
): InstanceTable {
    const table: InstanceTable = {
        id,
        label,
        headers,
        get rows() {
            const document = store.getDocumentView(handle) as Readonly<InstanceDocument>;
            return orderedRowIds(document.tables[id]).map((rowId) =>
                makeRow(store, handle, table, rowId),
            );
        },
    };
    return table;
}

/** Read the tables using an elaborated schema model. */
export function instanceTablesFromModel<Handle>(
    shape: InstanceCapableShape,
    store: DocumentStore<Handle>,
    handle: Handle,
    schemaModel: ElaboratedModel<Shape>,
): readonly InstanceTable[] {
    const judgments = schemaModel.judgments();
    const tableObjects = schemaModel
        .judgmentsOf({ objects: shape.supportsInstances.tableObjects })
        // This shouldn't be needed once judgmentsOf returns narrower types.
        .filter((judgment): judgment is ObjectJudgment<ObjectType> => judgment.kind === "object");
    const tableIds = new Set(tableObjects.map((object) => object.id));

    return tableObjects.map((tableObject) => {
        const headers: TableHeader[] = [];
        for (const morphism of judgments) {
            if (morphism.kind !== "morphism" || morphism.from?.id !== tableObject.id) {
                continue;
            }
            const codomain = morphism.to;
            if (codomain === null) {
                continue;
            }

            if (tableIds.has(codomain.id)) {
                headers.push({
                    id: morphism.id,
                    label: displayLabel(morphism.label),
                    type: { tag: "RowRef", content: { id: codomain.id } },
                });
                continue;
            }

            const literalType = atomicTypeOfAttributeType(codomain.label);
            headers.push({
                id: morphism.id,
                label: displayLabel(morphism.label),
                type: { tag: literalType },
            });
        }
        return makeTable(store, handle, tableObject.id, displayLabel(tableObject.label), headers);
    });
}

/** Extend schema-derived tables with any orphaned stored data.

Orphaned stored fields are appended to their table's headers as `Unknown`-typed
headers, and stored tables without a schema entity become tables with `null`
labels whose headers are derived from the stored field ids. */
export function tablesWithOrphanedData<Handle>(
    store: DocumentStore<Handle>,
    handle: Handle,
    schemaTables: ReadonlyArray<InstanceTable>,
): ReadonlyArray<InstanceTable> {
    const document = store.getDocumentView(handle) as Readonly<InstanceDocument>;
    const schemaTableIds = new Set(schemaTables.map((table) => table.id));

    const tables = schemaTables.map((table) => {
        const orphanedFieldIds = storedFieldIds(
            document.tables[table.id],
            new Set(table.headers.map((header) => header.id)),
        );
        if (orphanedFieldIds.length === 0) {
            return table;
        }
        return makeTable(store, handle, table.id, table.label, [
            ...table.headers,
            ...orphanedFieldIds.map(unknownHeader),
        ]);
    });

    const orphanedTables = Object.keys(document.tables)
        .filter((tableId) => !schemaTableIds.has(tableId))
        .map((tableId) =>
            makeTable(
                store,
                handle,
                tableId,
                null,
                storedFieldIds(document.tables[tableId], new Set()).map(unknownHeader),
            ),
        );

    return [...tables, ...orphanedTables];
}

/** Collect stored field ids not in `knownIds`, in first-seen row order. */
function storedFieldIds(
    table: Readonly<DocumentTypes.Table> | undefined,
    knownIds: ReadonlySet<string>,
): string[] {
    const fieldIds: string[] = [];
    const seen = new Set(knownIds);
    for (const rowId of orderedRowIds(table)) {
        for (const fieldId of Object.keys(table?.rows[rowId]?.fields ?? {})) {
            if (!seen.has(fieldId)) {
                seen.add(fieldId);
                fieldIds.push(fieldId);
            }
        }
    }
    return fieldIds;
}

function unknownHeader(fieldId: string): TableHeader {
    return { id: fieldId, label: null, type: { tag: "Unknown" } };
}

function displayLabel(label: QualifiedLabel): string {
    return label.join(".");
}

function fieldValueFromStored(path: FieldPath, value: DocumentTypes.FieldValue): FieldValue {
    if (value === "Null") {
        return { tag: "Null", content: { path } };
    }
    if ("Bool" in value) {
        return { tag: "Bool", content: { path, value: value.Bool } };
    }
    if ("Int" in value) {
        return { tag: "Int", content: { path, value: value.Int } };
    }
    if ("Float" in value) {
        return { tag: "Float", content: { path, value: value.Float } };
    }
    if ("String" in value) {
        return { tag: "String", content: { path, value: value.String } };
    }
    return { tag: "RowRef", content: { path, id: value.RowRef } };
}

function orderedRowIds(table: Readonly<DocumentTypes.Table> | undefined): string[] {
    if (table === undefined) {
        return [];
    }
    const seen = new Set<string>();
    const ordered: string[] = [];
    for (const id of table.rowOrder ?? []) {
        if (table.rows[id] !== undefined && !seen.has(id)) {
            seen.add(id);
            ordered.push(id);
        }
    }
    for (const id of Object.keys(table.rows)) {
        if (!seen.has(id)) {
            ordered.push(id);
        }
    }
    return ordered;
}

function pathError(message: string) {
    return { tag: "Err" as const, content: [{ message }] };
}
