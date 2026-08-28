import type { InstanceDocument } from "catcolab-document-methods";
import type { Document } from "catcolab-document-types";
import type { DocumentStore } from "../document-store";
import type { ModelDocument } from "../model/document";
import type { ModelValidation } from "../model/elaborated-model";
import type { Notebook } from "../model/notebook";
import type { Result } from "../result";
import type { Shape } from "../shape";
import type { TableIssue } from "./errors";
import {
    createAddRowsMethod,
    createAddRowMethod,
    createInstanceValidator,
    createSetMethod,
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
    ): Promise<Result<void>>;
    updateRows(
        updates: ReadonlyArray<{
            row: TableRow;
            values: ReadonlyArray<Record<string, LiteralValue | TableRow>>;
        }>,
    ): Promise<Result<void>>;
    set(
        row: TableRow,
        morphism: { id: string },
        value: LiteralValue | TableRow,
    ): Promise<Result<void>>;

    /** Delete stored rows without requiring a valid schema. */
    deleteRow(tableId: string, rowId: string): void;
    deleteRows(rows: ReadonlyArray<{ tableId: string; rowId: string }>): void;

    /** Validate the schema and instance data. Schema issues are reported by
    `modelValidation`; instance-data issues are reported by `issues`. */
    validate(): Promise<InstanceValidation<S>>;
    /** Subscribe to changes to either the instance document or its schema. */
    onChange(callback: () => void): () => void;
    /** Revalidate initially and whenever either the instance or its schema changes. */
    onValidate(callback: (validation: InstanceValidation<S>) => void): () => void;
}

/** The result of validating an instance and its schema. */
export interface InstanceValidation<out S extends Shape> {
    /** The result of elaborating and validating the instance's schema. */
    readonly modelValidation: ModelValidation<S>;
    /** The instance's tables, including any orphaned stored data. */
    readonly tables: ReadonlyArray<InstanceTable>;
    /** Problems with the instance data; empty when the data is valid. */
    readonly issues: ReadonlyArray<TableIssue>;
    /** Read one table, row, or field from the validated tables. */
    get(path: InstancePath): Result<InstanceTable | TableRow | FieldValue>;
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

    const addRows = createAddRowsMethod(schema, store, handle);
    const addRow = createAddRowMethod(addRows);
    const updateRows = createUpdateRowsMethod(schema, store, handle);
    const updateRow = createUpdateRowMethod(updateRows);
    const set = createSetMethod(schema, store, handle);
    const validateInstance = createInstanceValidator(schema, store, handle);

    async function validateCurrentDocument(): Promise<InstanceValidation<S>> {
        return validateInstance(await schema.validate());
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
        validate(): Promise<InstanceValidation<S>> {
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
        onValidate(callback: (validation: InstanceValidation<S>) => void): () => void {
            let active: boolean = true;
            let latestModelValidation: ModelValidation<S> | undefined;

            function notify(validation: InstanceValidation<S>): void {
                if (active) {
                    callback(validation);
                }
            }

            const unsubscribeInstance: () => void = store.subscribe(handle, (): void => {
                if (latestModelValidation !== undefined) {
                    notify(validateInstance(latestModelValidation));
                }
            });
            const unsubscribeSchema: () => void = schema.onValidate((modelValidation): void => {
                latestModelValidation = modelValidation;
                notify(validateInstance(modelValidation));
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
