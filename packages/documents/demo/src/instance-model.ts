import { Entity } from "catcolab-logics/simple-schema";

import type { ObjectCell, TableRow } from "catcolab-documents";
import {
    attrCells,
    ATTR_TYPE_NAMES,
    type AttrTypeName,
    type DemoDocument,
    mappingCells,
} from "./document";

/**
 * A column in an entity's instance table. Every column corresponds to one
 * schema morphism whose *domain* is this entity: an attribute (a literal value)
 * or a mapping / foreign key (a reference to a row of another entity).
 */
export type Column =
    | {
          kind: "attr";
          /** The schema attribute cell id (stable key for this column). */
          morphismId: string;
          title: string;
          /** The scalar type used to edit and encode this attribute. */
          attrType: AttrTypeName;
      }
    | {
          kind: "mapping";
          morphismId: string;
          title: string;
          /** The entity this foreign key points at. */
          codomain: ObjectCell;
      };

/** The full spec of one entity's table: its identity, columns, and rows. */
export type TableSpec = {
    entity: ObjectCell;
    columns: Column[];
    rows: TableRow[];
};

/**
 * A signature string that changes exactly when a table must be *rebuilt* (as
 * opposed to merely re-filled with data): the entity set, and each table's
 * columns with their kinds, titles, and mapping codomains. Row edits do not
 * change it. Comparing signatures lets the view rebuild jspreadsheet only when
 * the schema shape changes, per the demo's structural requirements.
 */
export function schemaShapeSignature(doc: DemoDocument): string {
    return tableSpecs(doc)
        .map((spec) => {
            const cols = spec.columns
                .map((c) =>
                    c.kind === "attr"
                        ? `a:${c.morphismId}:${c.title}:${c.attrType}`
                        : `m:${c.morphismId}:${c.title}:${c.codomain.id}`,
                )
                .join(",");
            return `${spec.entity.id}[${cols}]`;
        })
        .join("|");
}

/** Build the table spec for every entity in the schema. */
export function tableSpecs(doc: DemoDocument): TableSpec[] {
    const entities = doc.schema.cellsOf(Entity);
    return entities.map((entity) => ({
        entity,
        columns: columnsFor(doc, entity),
        rows: doc.tableFor(entity)?.rows ?? [],
    }));
}

/** The columns for one entity: its outgoing attributes then its outgoing mappings. */
export function columnsFor(doc: DemoDocument, entity: ObjectCell): Column[] {
    const attrColumns: Column[] = attrCells(doc)
        .filter((cell) => cell.from?.id === entity.id)
        .map((cell) => ({
            kind: "attr",
            morphismId: cell.id,
            title: cell.label || "(unnamed)",
            attrType: ATTR_TYPE_NAMES.find((name) => name === cell.to?.label) ?? "String",
        }));

    const mappingColumns: Column[] = mappingCells(doc)
        .filter((cell) => cell.from?.id === entity.id && cell.to !== undefined)
        .map((cell) => ({
            kind: "mapping",
            morphismId: cell.id,
            title: cell.label || "(unnamed)",
            // The codomain is a live entity cell; if the codomain entity was
            // deleted this filters out above (cell.to === undefined).
            codomain: cell.to as ObjectCell,
        }));

    return [...attrColumns, ...mappingColumns];
}

/** A compact, stable display label for a row wherever instances are navigated. */
export function rowLabel(doc: DemoDocument, entity: ObjectCell, row: TableRow): string {
    const index = row.index + 1;
    const firstColumn = columnsFor(doc, entity)[0];
    const firstValue =
        firstColumn?.kind === "attr"
            ? doc.rowValue(entity, row, firstColumn.morphismId)
            : undefined;
    const entityName = entity.label || "(unnamed entity)";
    return typeof firstValue === "string" && firstValue !== ""
        ? `${entityName} "${firstValue}"`
        : `${entityName} ${index}`;
}

/**
 * Like {@link rowLabel} but without the entity-name prefix: shows the first
 * attribute value (`X`) or falls back to `Entity 1` when it is empty.
 */
export function rowShortLabel(doc: DemoDocument, entity: ObjectCell, row: TableRow): string {
    const index = row.index + 1;
    const firstColumn = columnsFor(doc, entity)[0];
    const firstValue =
        firstColumn?.kind === "attr"
            ? doc.rowValue(entity, row, firstColumn.morphismId)
            : undefined;
    const entityName = entity.label || "(unnamed entity)";
    return typeof firstValue === "string" && firstValue !== ""
        ? firstValue
        : `${entityName} ${index}`;
}
