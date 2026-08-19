import type { InstanceDocument } from "catcolab-document-methods";
import type { Document } from "catcolab-document-types";
import type { DocumentStore } from "../document-store";
import type { ModelDocument } from "../model/document";
import type { Notebook } from "../model/notebook";
import type { Issue, Result } from "../result";
import type { Shape } from "../shape";
import type { TableFieldIssue } from "./errors";
import {
    createAddRowsMethod,
    createAddRowMethod,
    createGetMethod,
    createSchemaResultValidator,
    createSetMethod,
    createTablesMethod,
    createUpdateRowsMethod,
    createUpdateRowMethod,
} from "./instance-runtime";
import type { FieldValue, InstancePath, InstanceTable, LiteralValue, TableRow } from "./tables";

export type { InstanceDocument } from "catcolab-document-methods";

/** API for an instance document and its schema-derived tables. */
export interface Instance<H, S extends Shape> {
    readonly handle: H;
    readonly shape: S;
    readonly document: Readonly<InstanceDocument>;
    readonly title: string;

    tables(): Promise<Result<ReadonlyArray<InstanceTable>>>;
    get(path: InstancePath): Promise<Result<InstanceTable | TableRow | FieldValue>>;

    update(patch: Partial<{ title: string }>): void;
    dump(): InstanceDocument;

    addRow(
        table: InstanceTable,
        values?: Record<string, LiteralValue | TableRow>,
    ): Promise<Result<TableRow>>;
    addRows(
        additions: ReadonlyArray<{
            table: InstanceTable;
            values?: ReadonlyArray<Record<string, LiteralValue | TableRow>>;
        }>,
    ): Promise<Result<ReadonlyArray<TableRow>>>;
    updateRow(
        row: TableRow,
        values: Record<string, LiteralValue | TableRow>,
    ): Promise<Result<void, ReadonlyArray<Issue | TableFieldIssue>>>;
    updateRows(
        updates: ReadonlyArray<{
            row: TableRow;
            values: ReadonlyArray<Record<string, LiteralValue | TableRow>>;
        }>,
    ): Promise<Result<void, ReadonlyArray<Issue | TableFieldIssue>>>;
    set(
        row: TableRow,
        morphism: { id: string },
        value: LiteralValue | TableRow,
    ): Promise<Result<void, ReadonlyArray<Issue | TableFieldIssue>>>;

    /** Delete stored rows without requiring a valid schema. */
    deleteRow(tableId: string, rowId: string): void;
    deleteRows(rows: ReadonlyArray<{ tableId: string; rowId: string }>): void;

    /* Validate both the schema and then the instance */
    validate(): Promise<Result<void, ReadonlyArray<Issue | TableFieldIssue>>>;
    /** Subscribe to changes to either the instance document or its schema. */
    onChange(callback: () => void): () => void;
    /** Revalidate initially and whenever either the instance or its schema changes. */
    onValidate(
        callback: (result: Result<void, ReadonlyArray<Issue | TableFieldIssue>>) => void,
    ): () => void;
}

/** Create a store-backed instance. Schema-derived operations validate the schema on demand. */
export function instanceFromStore<Handle, S extends Shape>(
    shape: S,
    schema: Notebook<S, ModelDocument, Handle>,
    store: DocumentStore<Handle>,
    handle: Handle,
): Instance<Handle, S> {
    function currentDocument(): Readonly<InstanceDocument> {
        return store.getDocumentView(handle) as Readonly<InstanceDocument>;
    }

    const tables = createTablesMethod(schema, store, handle);
    const get = createGetMethod(schema, store, handle);
    const addRows = createAddRowsMethod(schema, store, handle);
    const addRow = createAddRowMethod(addRows);
    const updateRows = createUpdateRowsMethod(schema, store, handle);
    const updateRow = createUpdateRowMethod(updateRows);
    const set = createSetMethod(schema, store, handle);
    const validateSchemaResult = createSchemaResultValidator(schema, store, handle);

    async function validateCurrentDocument(): Promise<
        Result<undefined, ReadonlyArray<Issue | TableFieldIssue>>
    > {
        return validateSchemaResult(await schema.validate());
    }

    function deleteStoredRows(rows: ReadonlyArray<{ tableId: string; rowId: string }>): void {
        store.changeDocument(handle, (document: Document): void => {
            const instanceDocument: InstanceDocument = document as InstanceDocument;
            for (const { tableId, rowId } of rows) {
                const table: InstanceDocument["tables"][string] | undefined =
                    instanceDocument.tables[tableId];
                if (table === undefined) {
                    continue;
                }
                delete table.rows[rowId];
                table.rowOrder = table.rowOrder.filter(
                    (storedRowId: string): boolean => storedRowId !== rowId,
                );
            }
        });
    }

    const instance: Instance<Handle, S> = {
        handle,
        shape,
        get document(): Readonly<InstanceDocument> {
            return currentDocument();
        },
        get title(): string {
            return currentDocument().name;
        },
        tables,
        get,
        update(patch: Partial<{ title: string }>): void {
            if (patch.title !== undefined) {
                store.changeDocument(handle, (document: Document): void => {
                    (document as InstanceDocument).name = patch.title as string;
                });
            }
        },
        dump(): InstanceDocument {
            return store.copyValue(handle, currentDocument());
        },
        addRow,
        addRows,
        updateRow,
        updateRows,
        set,
        deleteRow(tableId: string, rowId: string): void {
            deleteStoredRows([{ tableId, rowId }]);
        },
        deleteRows(rows: ReadonlyArray<{ tableId: string; rowId: string }>): void {
            deleteStoredRows(rows);
        },
        validate(): Promise<Result<undefined, ReadonlyArray<Issue | TableFieldIssue>>> {
            return validateCurrentDocument();
        },
        onChange(callback: () => void): () => void {
            const unsubscribeInstance: () => void = store.subscribe(handle, callback);
            const unsubscribeSchema: () => void = schema.onChange(callback);
            return (): void => {
                unsubscribeInstance();
                unsubscribeSchema();
            };
        },
        onValidate(
            callback: (result: Result<undefined, ReadonlyArray<Issue | TableFieldIssue>>) => void,
        ): () => void {
            let active: boolean = true;

            function notify(
                result: Result<undefined, ReadonlyArray<Issue | TableFieldIssue>>,
            ): void {
                if (active) {
                    callback(result);
                }
            }

            async function validateAndNotify(): Promise<void> {
                notify(await validateCurrentDocument());
            }

            const unsubscribeInstance: () => void = store.subscribe(handle, (): void => {
                void validateAndNotify();
            });
            const unsubscribeSchema: () => void = schema.onValidate((result): void => {
                notify(validateSchemaResult(result));
            });

            return (): void => {
                active = false;
                unsubscribeInstance();
                unsubscribeSchema();
            };
        },
    };

    return instance;
}
