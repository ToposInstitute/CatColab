import type { FieldPath } from "./errors";

/** Path relative to the document's `tables` map. */
export type InstancePath = [string, ...string[]];

export type LiteralValue = boolean | number | string | null;
export type LiteralType = "Bool" | "Int" | "Float" | "String";

export interface InstanceTable {
    /** The table's id: the same as the schema entity's id. */
    readonly id: string;
    /** The schema entity's display label; `""` when unlabeled. */
    readonly label: string;
    /** The table's rows, in stored order. */
    readonly rows: ReadonlyArray<TableRow>;
    /** The table's headers: the schema morphisms out of its entity. */
    readonly headers: ReadonlyArray<TableHeader>;
}

export interface TableHeader {
    /** The schema morphism's id. */
    readonly id: string;
    /** Dot-joined qualified label; empty when unlabeled. */
    readonly label: string;
    readonly type:
        | { readonly tag: LiteralType }
        | { readonly tag: "RowRef"; readonly content: { readonly id: string } };
}

export interface TableRow {
    /** The row's id, derived from its key in the stored table. */
    readonly id: string;
    /** The row's zero-based position in the table. */
    readonly index: number;
    /** The row's schema-interpreted fields. */
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
