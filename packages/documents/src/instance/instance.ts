import type { InstanceDocument } from "catcolab-document-methods";
import type { Document } from "catcolab-document-types";
import { createReactiveView, type DocumentStore } from "../document-store";
import type { ModelDocument } from "../model/document";
import type { ModelValidation, ModelValidationView } from "../model/elaborated-model";
import type { Notebook } from "../model/notebook";
import type { Result } from "../result";
import type { Shape } from "../shape";
import type { Commit } from "../transaction";
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
export interface Instance<H, S extends Shape, V> {
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
    /** Create a live, reactive view of the instance's validation state. The
     * caller must dispose the view when it is no longer needed. */
    createValidationView(): InstanceValidationView<S>;

    /** Undo the changes this instance's document received in a commit. */
    revert(commit: Commit<H, V>): void;
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

/** A live view of an instance's validation state. */
export interface InstanceValidationView<out S extends Shape> extends InstanceValidation<S> {
    /** The live validation view of the instance's schema. */
    readonly modelValidation: ModelValidationView<S>;
    dispose(): void;
}

/** Create a store-backed instance. Schema-derived operations validate the schema on demand.

Schema-derived operations elaborate the schema on demand and work against the
resulting model even when the schema is only partially valid. */
export function instanceFromStore<Handle, S extends Shape, Version>(
    shape: S,
    schema: Notebook<S, ModelDocument, Handle, Version>,
    store: DocumentStore<Handle, Version>,
    handle: Handle,
): Instance<Handle, S, Version> {
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

    const instance: Instance<Handle, S, Version> = {
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
        createValidationView(): InstanceValidationView<S> {
            const modelValidation = schema.createValidationView();
            let revision = 0;
            const reactiveRevision = createReactiveView(store, { revision });
            const unsubscribeInstance = store.subscribe(handle, (): void => {
                reactiveRevision.replace({ revision: ++revision });
            });

            function currentValidation(): InstanceValidation<S> {
                void reactiveRevision.current.revision;
                return validateInstance(modelValidation);
            }

            return {
                modelValidation,
                get tables(): ReadonlyArray<InstanceTable> {
                    return currentValidation().tables;
                },
                get issues(): ReadonlyArray<TableIssue> {
                    return currentValidation().issues;
                },
                get(path: InstancePath): Result<InstanceTable | TableRow | FieldValue> {
                    return currentValidation().get(path);
                },
                dispose(): void {
                    unsubscribeInstance();
                    modelValidation.dispose();
                },
            };
        },
        revert(commit: Commit<Handle, Version>): void {
            const change = commit.documents.get(handle);
            if (change === undefined) {
                throw new Error("The instance's document was not part of the commit.");
            }
            store.revertCommit(handle, change);
        },
    };

    return instance;
}
