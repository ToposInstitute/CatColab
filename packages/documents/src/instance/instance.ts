import type { InstanceDocument } from "catcolab-document-methods";
import type { Document } from "catcolab-document-types";
import type { DeepReadonly, DocumentStore } from "../document-store";
import type { ModelDocument } from "../model/document";
import type { ElaboratedModel, ModelValidation } from "../model/elaborated-model";
import type { Notebook } from "../model/notebook";
import type { Result } from "../result";
import type { InstanceCapableShape, Shape } from "../shape";
import type { Commit } from "../transaction";
import { createSubscriptionScope } from "../util/subscription-scope";
import type { TableIssue } from "./errors";
import {
    addInstanceRowsToStore,
    deleteOrphanedFieldFromStore,
    deleteOrphanedTableFromStore,
    updateInstanceFieldByIdInStore,
    updateInstanceFieldsByLabelInStore,
} from "./table-methods";
import type { FieldValue, InstancePath, InstanceTable, LiteralValue, TableRow } from "./tables";
import { createInstanceValidator } from "./validation";

export type { InstanceDocument } from "catcolab-document-methods";

/** API for an instance document and its schema-derived tables. */
export interface Instance<S extends Shape = Shape, H = unknown, V = unknown> {
    /** The document's type, discriminating `SupportedDocument`. */
    readonly type: "instance";
    readonly handle: H;
    readonly shape: S;
    /** The schema notebook this instance is an instance of. */
    readonly schema: Notebook<S, ModelDocument, H, V>;
    readonly document: DeepReadonly<InstanceDocument>;
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

    /** Delete a stored table that has no entity in the schema. */
    deleteOrphanedTable(tableId: string): Promise<Result<void>>;
    /** Delete a stored field from every row of a table when the field has no
    morphism in the schema. */
    deleteOrphanedColumn(tableId: string, fieldId: string): Promise<Result<void>>;

    /** Validate the schema and instance data. Schema issues are reported by
    `modelValidation`; instance-data issues are reported by `issues`. */
    validate(): Promise<InstanceValidation<S>>;
    /** Subscribe to changes to either the instance document or its schema. */
    onChange(callback: () => void): () => void;
    /** Revalidate initially and whenever either the instance or its schema changes. */
    onValidate(callback: (validation: InstanceValidation<S>) => void): () => void;

    /** Release this owner's change/validation subscriptions.
    Call when the instance is no longer used. Idempotent. */
    dispose(): void;

    /** Undo the changes this instance's document received in a commit. */
    revert(commit: Commit<H, V>): void;
}

/** The result of validating an instance and its schema. */
export interface InstanceValidation<out S extends Shape = Shape> {
    /** The result of elaborating and validating the instance's schema. */
    readonly modelValidation: ModelValidation<S>;
    /** Snapshot tables, including orphaned data. Rows and fields do not change
     * after validation; revalidate or subscribe to obtain newer data. */
    readonly tables: ReadonlyArray<InstanceTable>;
    /** Problems with the instance data; empty when the data is valid. */
    readonly issues: ReadonlyArray<TableIssue>;
    /** Read one table, row, or field from the validated tables. */
    get(path: InstancePath): Result<InstanceTable | TableRow | FieldValue>;
}

/** Create a store-backed instance.

Schema-derived operations elaborate the schema on demand and work against the
resulting model even when the schema is only partially valid. */
export function instanceFromStore<Handle, S extends Shape, Version>(
    schema: Notebook<S, ModelDocument, Handle, Version>,
    store: DocumentStore<Handle, Version>,
    handle: Handle,
): Instance<S, Handle, Version> {
    const scope = createSubscriptionScope();

    function currentDocument(): DeepReadonly<InstanceDocument> {
        return store.getDocumentSnapshot(handle).document as DeepReadonly<InstanceDocument>;
    }

    const validator = createInstanceValidator(schema, store, handle);

    function instanceCapableShape(): InstanceCapableShape {
        if (schema.shape.supportsInstances === undefined) {
            throw new Error(
                `Shape \`${schema.shape.theory ?? "unnamed"}\` does not support instances`,
            );
        }
        return schema.shape as InstanceCapableShape;
    }

    /** Operate against whatever judgments elaborate, even for a partially
    valid schema. Operations report addressing failures as Results; thrown
    exceptions still propagate. */
    async function withElaboratedSchema<T>(
        operation: (model: ElaboratedModel<S>) => Result<T>,
    ): Promise<Result<T>> {
        return operation((await schema.validate()).model);
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

    const instance: Instance<S, Handle, Version> = {
        type: "instance",
        handle,
        shape: schema.shape,
        schema,
        get document(): DeepReadonly<InstanceDocument> {
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
            return structuredClone(currentDocument()) as InstanceDocument;
        },
        async addRow(table, values = {}) {
            const result = await instance.addRows([{ table, values: [values] }]);
            if (result.tag === "Err") {
                return result;
            }
            const row = result.content[0];
            return row === undefined
                ? { tag: "Err", content: [{ message: "Adding one row did not return a row" }] }
                : { tag: "Ok", content: row };
        },
        addRows(additions) {
            return withElaboratedSchema((model) =>
                addInstanceRowsToStore(
                    instanceCapableShape(),
                    store,
                    handle,
                    model,
                    additions.map(({ table, values }) => ({ table, values: values ?? [{}] })),
                ),
            );
        },
        updateRow(row, values) {
            return instance.updateRows([{ row, values: [values] }]);
        },
        updateRows(updates) {
            return withElaboratedSchema((model) =>
                updateInstanceFieldsByLabelInStore(
                    instanceCapableShape(),
                    store,
                    handle,
                    model,
                    updates,
                ),
            );
        },
        set(row, morphism, value) {
            return withElaboratedSchema((model) =>
                updateInstanceFieldByIdInStore(
                    instanceCapableShape(),
                    store,
                    handle,
                    model,
                    row,
                    morphism,
                    value,
                ),
            );
        },
        deleteRow(tableId: string, rowId: string): void {
            deleteStoredRows([{ tableId, rowId }]);
        },
        deleteRows(rows: ReadonlyArray<{ tableId: string; rowId: string }>): void {
            deleteStoredRows(rows);
        },
        deleteOrphanedTable(tableId) {
            return withElaboratedSchema((model) =>
                deleteOrphanedTableFromStore(instanceCapableShape(), store, handle, model, tableId),
            );
        },
        deleteOrphanedColumn(tableId, fieldId) {
            return withElaboratedSchema((model) =>
                deleteOrphanedFieldFromStore(
                    instanceCapableShape(),
                    store,
                    handle,
                    model,
                    tableId,
                    fieldId,
                ),
            );
        },
        validate: validator.validate,
        onChange(callback: () => void): () => void {
            const unsubscribeInstance: () => void = store.subscribe(handle, callback);
            const unsubscribeSchema: () => void = schema.onChange(callback);
            return scope.track((): void => {
                unsubscribeInstance();
                unsubscribeSchema();
            });
        },
        onValidate: (callback) => scope.track(validator.onValidate(callback)),
        dispose: scope.dispose,
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
