import type { FieldPath } from "./errors";

/** Path relative to the document's `tables` map. */
export type InstancePath = [string] | [string, "rows", string] | FieldPath;

export type LiteralValue = boolean | number | string | null;
export type LiteralType = "Bool" | "Int" | "Float" | "String";

export interface InstanceTable {
    /** The stored table id; when the schema entity exists (non-orphaned) then
     * this is that entity's id. */
    readonly id: string;
    /** The schema entity's display label; `""` when unlabeled, `null` when the
    table has no entity in the schema. */
    readonly label: string | null;
    /** The table's rows, in stored order. */
    readonly rows: ReadonlyArray<TableRow>;
    /** The table's headers: the schema morphisms out of its entity, followed
    by `Unknown`-typed headers for any orphaned stored fields. */
    readonly headers: ReadonlyArray<TableHeader>;
}

export interface TableHeader {
    /** The schema morphism id, or the stored field id when the header is unknown. */
    readonly id: string;
    /** Dot-joined qualified label; `""` when unlabeled, `null` when the header
    has no morphism in the schema. */
    readonly label: string | null;
    readonly type:
        | { readonly tag: LiteralType }
        | { readonly tag: "RowRef"; readonly content: { readonly id: string } }
        | { readonly tag: "Unknown" };
}

export interface TableRow {
    /** The row's id, derived from its key in the stored table. */
    readonly id: string;
    /** The row's zero-based position in the table. */
    readonly index: number;
    /** The row's decoded fields, in header order. */
    readonly fields: ReadonlyArray<FieldValue>;
}

export type FieldValue =
    | { readonly tag: "Null"; readonly content: { readonly path: FieldPath } }
    | {
          readonly tag: "Bool";
          readonly content: { readonly path: FieldPath; readonly value: boolean };
      }
    | {
          readonly tag: "Int";
          readonly content: { readonly path: FieldPath; readonly value: number };
      }
    | {
          readonly tag: "Float";
          readonly content: { readonly path: FieldPath; readonly value: number };
      }
    | {
          readonly tag: "String";
          readonly content: { readonly path: FieldPath; readonly value: string };
      }
    | {
          readonly tag: "RowRef";
          readonly content: { readonly path: FieldPath; readonly id: string };
      };

export function isLiteralField(field: FieldValue): field is LiteralFieldValue {
    return field.tag !== "Null" && field.tag !== "RowRef";
}
