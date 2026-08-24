import type { InstanceDocument } from "catcolab-document-methods";
import type { Issue, Result } from "../result";
import type { Shape } from "../shape";
import type { TableFieldIssue } from "./errors";
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
