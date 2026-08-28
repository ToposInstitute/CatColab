import type { InstanceDocument } from "catcolab-document-methods";
import type { DocumentStore } from "../document-store";
import type { ModelDocument } from "../model/document";
import type { ElaboratedModel, ModelValidation } from "../model/elaborated-model";
import type { Notebook } from "../model/notebook";
import type { Issue, Result } from "../result";
import type { InstanceCapableShape, Shape } from "../shape";
import type { TableFieldIssue } from "./errors";
import {
    addInstanceRowsToStore,
    instanceTablesFromModel,
    readInstancePathFromStore,
    updateInstanceFieldByIdInStore,
    updateInstanceFieldsByLabelInStore,
} from "./table-methods";
import type { FieldValue, InstancePath, InstanceTable, LiteralValue, TableRow } from "./tables";
import { validateTableFields } from "./validation";

function instanceCapableShape<Handle, S extends Shape>(
    schema: Notebook<S, ModelDocument, Handle>,
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
async function withValidatedSchema<
    Handle,
    S extends Shape,
    T,
    E extends ReadonlyArray<Issue> = ReadonlyArray<Issue>,
>(
    schema: Notebook<S, ModelDocument, Handle>,
    operation: (schemaModel: ElaboratedModel<S>) => Result<T, E>,
): Promise<Result<T, E>> {
    const schemaValidation = await schema.validate();
    if (schemaValidation.issues.length > 0) {
        return { tag: "Err", content: schemaValidation.issues as E };
    }

    return operation(schemaValidation.model);
}

export function createTablesMethod<Handle, S extends Shape>(
    schema: Notebook<S, ModelDocument, Handle>,
    store: DocumentStore<Handle>,
    handle: Handle,
): () => Promise<Result<ReadonlyArray<InstanceTable>>> {
    return () =>
        withValidatedSchema(
            schema,
            (schemaModel): Result<ReadonlyArray<InstanceTable>> => ({
                tag: "Ok",
                content: instanceTablesFromModel(
                    instanceCapableShape(schema),
                    store,
                    handle,
                    schemaModel,
                ),
            }),
        );
}

export function createGetMethod<Handle, S extends Shape>(
    schema: Notebook<S, ModelDocument, Handle>,
    store: DocumentStore<Handle>,
    handle: Handle,
): (path: InstancePath) => Promise<Result<InstanceTable | TableRow | FieldValue>> {
    return (path) =>
        withValidatedSchema(schema, (schemaModel) =>
            readInstancePathFromStore(
                instanceCapableShape(schema),
                store,
                handle,
                schemaModel,
                path,
            ),
        );
}

export function createAddRowsMethod<Handle, S extends Shape>(
    schema: Notebook<S, ModelDocument, Handle>,
    store: DocumentStore<Handle>,
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

export function createUpdateRowsMethod<Handle, S extends Shape>(
    schema: Notebook<S, ModelDocument, Handle>,
    store: DocumentStore<Handle>,
    handle: Handle,
): (
    updates: ReadonlyArray<{
        row: TableRow;
        values: ReadonlyArray<Record<string, LiteralValue | TableRow>>;
    }>,
) => Promise<Result<undefined, ReadonlyArray<Issue | TableFieldIssue>>> {
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
): (
    row: TableRow,
    values: Record<string, LiteralValue | TableRow>,
) => Promise<Result<undefined, ReadonlyArray<Issue | TableFieldIssue>>> {
    return (row, values) => updateRows([{ row, values: [values] }]);
}

export function createSetMethod<Handle, S extends Shape>(
    schema: Notebook<S, ModelDocument, Handle>,
    store: DocumentStore<Handle>,
    handle: Handle,
): (
    row: TableRow,
    morphism: { id: string },
    value: LiteralValue | TableRow,
) => Promise<Result<undefined, ReadonlyArray<Issue | TableFieldIssue>>> {
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

/** Build a validator that combines schema validation with instance-content
validation. */
export function createSchemaResultValidator<Handle, S extends Shape>(
    schema: Notebook<S, ModelDocument, Handle>,
    store: DocumentStore<Handle>,
    handle: Handle,
): (schemaValidation: ModelValidation<S>) => Result<void, ReadonlyArray<Issue | TableFieldIssue>> {
    return (schemaValidation) => {
        if (schemaValidation.issues.length > 0) {
            return { tag: "Err", content: schemaValidation.issues };
        }

        const tables = instanceTablesFromModel(
            instanceCapableShape(schema),
            store,
            handle,
            schemaValidation.model,
        );
        const issues: TableFieldIssue[] = validateTableFields(
            store.getDocumentView(handle) as Readonly<InstanceDocument>,
            tables,
        );
        return issues.length === 0
            ? { tag: "Ok", content: undefined }
            : { tag: "Err", content: issues };
    };
}
