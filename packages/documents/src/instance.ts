import type { Document, FieldValue, Link, Table } from "catcolab-document-types";
import { currentVersion } from "catcolab-document-types";

/**
 * An *instance* document: a database of a schema, stored in the v2 document
 * shape as an array of {@link Table}s — one per schema entity — each holding
 * the `TableRow`s instantiating that entity.
 *
 * The storage is deliberately keyed by the schema's *generator UUIDs* rather
 * than by any elaborated identity. A schema is a model whose object and morphism
 * generators each carry a stable UUID; those UUIDs can never be confused with
 * one another. A table names the schema entity it instantiates by UUID
 * ({@link Table.id}), and a row's `fields` maps schema morphism UUIDs (its
 * columns) to {@link FieldValue}s — a literal for an attribute, or the UUID of
 * another table row (`RowRef`) for a mapping.
 *
 * This is what lets the interface hide, but not lose, data when the schema
 * changes. When a morphism is deleted from the schema, the interface simply
 * stops displaying the content values whose morphism UUID no longer resolves to
 * a live schema morphism — but those values remain untouched in the document.
 * Likewise a table whose entity was deleted from the schema is retained but not
 * displayed. Because generators are identified by UUID, an undo/redo/rollback
 * of the schema that restores the generator automatically re-associates the
 * retained data with it, with no diffing of elaborated models required.
 */
export type InstanceDocument = Extract<Document, { type: "instance" }>;

/** Create an empty instance document referencing the schema it is an instance of. */
export const newInstanceDocument = (args: {
    instanceOf: Link;
    name?: string;
}): InstanceDocument => ({
    type: "instance",
    name: args.name ?? "",
    instanceOf: args.instanceOf,
    tables: {},
    version: currentVersion(),
});

/** Create an empty table instantiating one schema entity, keyed by its entity UUID path. */
export const newTable = (entity: string): Table => ({
    id: entity,
    rows: {},
    row_order: [],
});

/** Encode a literal as a stored {@link FieldValue}. */
export const encodeCellValue = (value: string | number | boolean): FieldValue => {
    switch (typeof value) {
        case "boolean":
            return { Bool: value };
        case "number": {
            if (!Number.isFinite(value)) {
                throw new RangeError("Instance cell numbers must be finite.");
            }
            if (Number.isInteger(value) && value >= -2_147_483_648 && value <= 2_147_483_647) {
                return { Int: value };
            }
            const floatValue = Math.fround(value);
            if (!Number.isFinite(floatValue)) {
                throw new RangeError("Instance cell number is outside the f32 range.");
            }
            return { Float: floatValue };
        }
        default:
            return { String: value };
    }
};
