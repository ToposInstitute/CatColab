import type { InstanceDocument } from "catcolab-document-methods";
import type { DocumentStore } from "../document-store";
import type { ModelDocument } from "../model/document";
import type { ElaboratedModel, ModelValidation } from "../model/elaborated-model";
import type { Notebook } from "../model/notebook";
import type { Result } from "../result";
import type { InstanceCapableShape, Shape } from "../shape";
import { validatePathEquations } from "./equation-validation";
import type { InstanceValidation } from "./instance";
import {
    addInstanceRowsToStore,
    instanceTablesFromModel,
    readInstancePath,
    tablesWithOrphanedData,
    updateInstanceFieldByIdInStore,
    updateInstanceFieldsByLabelInStore,
} from "./table-methods";
import type { InstanceTable, LiteralValue, TableRow } from "./tables";
import { validateInstanceTables } from "./validation";

function instanceCapableShape<Handle, S extends Shape, Version>(
    schema: Notebook<S, ModelDocument, Handle, Version>,
): InstanceCapableShape {
    const shape = schema.shape;
    if (shape.supportsInstances === undefined) {
        throw new Error(`Shape \`${shape.theory ?? "unnamed"}\` does not support instances`);
    }
    return shape as InstanceCapableShape;
}

/** Validate the schema and run an operation against the resulting model.

`operation` is expected to report its own failures as a `Result`; this does not
catch exceptions, so an operation that throws lets that exception propagate. */
async function withValidatedSchema<Handle, S extends Shape, Version, T>(
    schema: Notebook<S, ModelDocument, Handle, Version>,
    operation: (schemaModel: ElaboratedModel<S>) => Result<T>,
): Promise<Result<T>> {
    const schemaValidation = await schema.validate();
    if (schemaValidation.issues.length > 0) {
        return { tag: "Err", content: schemaValidation.issues };
    }

    return operation(schemaValidation.model);
}

export function createAddRowsMethod<Handle, S extends Shape, Version>(
    schema: Notebook<S, ModelDocument, Handle, Version>,
    store: DocumentStore<Handle, Version>,
    handle: Handle,
): (
    additions: ReadonlyArray<{
        table: InstanceTable;
        values?: ReadonlyArray<Record<string, LiteralValue | TableRow>>;
    }>,
) => Promise<Result<ReadonlyArray<TableRow>>> {
    return (additions) =>
        withValidatedSchema(schema, (schemaModel) =>
            addInstanceRowsToStore(
                instanceCapableShape(schema),
                store,
                handle,
                schemaModel,
                additions.map(({ table, values }) => ({ table, values: values ?? [{}] })),
            ),
        );
}

export function createAddRowMethod(
    addRows: ReturnType<typeof createAddRowsMethod>,
): (
    table: InstanceTable,
    values?: Record<string, LiteralValue | TableRow>,
) => Promise<Result<TableRow>> {
    return async (table, values = {}) => {
        const result = await addRows([{ table, values: [values] }]);
        if (result.tag === "Err") {
            return result;
        }
        const row = result.content[0];
        return row === undefined
            ? { tag: "Err", content: [{ message: "Adding one row did not return a row" }] }
            : { tag: "Ok", content: row };
    };
}

export function createUpdateRowsMethod<Handle, S extends Shape, Version>(
    schema: Notebook<S, ModelDocument, Handle, Version>,
    store: DocumentStore<Handle, Version>,
    handle: Handle,
): (
    updates: ReadonlyArray<{
        row: TableRow;
        values: ReadonlyArray<Record<string, LiteralValue | TableRow>>;
    }>,
) => Promise<Result<void>> {
    return (updates) =>
        withValidatedSchema(schema, (schemaModel) =>
            updateInstanceFieldsByLabelInStore(
                instanceCapableShape(schema),
                store,
                handle,
                schemaModel,
                updates,
            ),
        );
}

export function createUpdateRowMethod(
    updateRows: ReturnType<typeof createUpdateRowsMethod>,
): (row: TableRow, values: Record<string, LiteralValue | TableRow>) => Promise<Result<void>> {
    return (row, values) => updateRows([{ row, values: [values] }]);
}

export function createSetMethod<Handle, S extends Shape, Version>(
    schema: Notebook<S, ModelDocument, Handle, Version>,
    store: DocumentStore<Handle, Version>,
    handle: Handle,
): (
    row: TableRow,
    morphism: { id: string },
    value: LiteralValue | TableRow,
) => Promise<Result<void>> {
    return (row, morphism, value) =>
        withValidatedSchema(schema, (schemaModel) =>
            updateInstanceFieldByIdInStore(
                instanceCapableShape(schema),
                store,
                handle,
                schemaModel,
                row,
                morphism,
                value,
            ),
        );
}

/** Build a validator that combines schema and instance validation. */
export function createInstanceValidator<Handle, S extends Shape, Version>(
    schema: Notebook<S, ModelDocument, Handle, Version>,
    store: DocumentStore<Handle, Version>,
    handle: Handle,
): (schemaValidation: ModelValidation<S>) => InstanceValidation<S> {
    return (schemaValidation) => {
        const schemaTables = instanceTablesFromModel(
            instanceCapableShape(schema),
            store,
            handle,
            schemaValidation.model,
        );
        const document = store.getDocumentView(handle) as Readonly<InstanceDocument>;
        const tables = tablesWithOrphanedData(store, handle, schemaTables);
        const issues = [
            ...validateInstanceTables(document, schemaTables),
            ...validatePathEquations(tables, schemaValidation.model),
        ];
        return {
            modelValidation: schemaValidation,
            tables,
            issues,
            get: (path) => readInstancePath(store, handle, tables, path),
        };
    };
}
