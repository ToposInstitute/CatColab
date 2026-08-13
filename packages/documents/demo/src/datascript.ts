import { Attr, AttrType, Entity, Mapping, SimpleSchema } from "catcolab-logics/simple-schema";
import { init_db, q, type Database } from "datascript";

import { type InstanceTable, type Notebook, type TableRow } from "catcolab-documents";

export const dataScriptAttributes = {
    schemaId: "catcolab/schema-id",
    rowId: "catcolab/row-id",
    label: "catcolab/label",
    kind: "catcolab/kind",
    entity: "catcolab/entity",
    domain: "catcolab/domain",
    codomain: "catcolab/codomain",
    queryAttribute: "catcolab/query-attribute",
    dangling: "catcolab/dangling",
} as const;

export type DataScriptAttribute = {
    attribute: string;
    entityLabel: string;
    label: string;
    kind: "attribute" | "mapping";
    schemaId: string;
};

export type DataScriptProjection = {
    db: Database;
    attributes: DataScriptAttribute[];
};

type Datom = [number, string, unknown];
type DataScriptDocument = {
    schema: Notebook<typeof SimpleSchema>;
    tables: () => InstanceTable[];
    rowId: (entity: { readonly id: string }, row: TableRow) => string | undefined;
    rowValue: (entity: { readonly id: string }, row: TableRow, morphismId: string) => unknown;
    rowReferenceId: (
        entity: { readonly id: string },
        row: TableRow,
        morphismId: string,
    ) => string | undefined;
};

/** Build an immutable DataScript database from the demo's current visible data. */
export function projectDataScript(doc: DataScriptDocument): DataScriptProjection {
    const entities = doc.schema.cellsOf(Entity);
    const entityIds = new Set(entities.map((entity) => entity.id));
    const attrTypes = doc.schema.cellsOf(AttrType);
    const schemaObjects = [...entities, ...attrTypes];
    const attrs = doc.schema.cellsOf(Attr);
    const mappings = doc.schema.cellsOf(Mapping);
    const morphisms = [
        ...attrs.map((cell) => ({ cell, kind: "attribute" as const })),
        ...mappings.map((cell) => ({ cell, kind: "mapping" as const })),
    ].filter(({ cell }) => cell.from && cell.to);

    let nextEid = 1;
    const objectEids = new Map(schemaObjects.map((object) => [object.id, nextEid++]));
    const morphismEids = new Map(morphisms.map(({ cell }) => [cell.id, nextEid++]));
    const tables = new Map(doc.tables().map((table) => [table.id, table]));
    const rows = entities.flatMap((entity) =>
        (tables.get(entity.id)?.rows ?? []).flatMap((row) => {
            const rowId = doc.rowId(entity, row);
            return rowId === undefined ? [] : [{ entity, row, rowId }];
        }),
    );
    const rowEids = new Map(rows.map(({ rowId }) => [rowId, nextEid++]));

    const entitySegments = uniqueSegments(
        entities.map((entity) => ({ id: entity.id, label: entity.label })),
    );
    const queryAttributes = new Map<string, string>();
    for (const entity of entities) {
        const outgoing = morphisms.filter(({ cell }) => cell.from?.id === entity.id);
        const segments = uniqueSegments(
            outgoing.map(({ cell }) => ({ id: cell.id, label: cell.label })),
        );
        for (const { cell } of outgoing) {
            queryAttributes.set(
                cell.id,
                `${entitySegments.get(entity.id)}/${segments.get(cell.id)}`,
            );
        }
    }

    const datoms: Datom[] = [];
    for (const object of schemaObjects) {
        const eid = objectEids.get(object.id);
        if (eid === undefined) {
            continue;
        }
        datoms.push(
            [eid, dataScriptAttributes.schemaId, object.id],
            [eid, dataScriptAttributes.label, object.label || "(unnamed)"],
            [
                eid,
                dataScriptAttributes.kind,
                entityIds.has(object.id) ? "entity" : "attribute-type",
            ],
        );
    }

    const attributes: DataScriptAttribute[] = [];
    for (const { cell, kind } of morphisms) {
        const eid = morphismEids.get(cell.id);
        const domainEid = cell.from && objectEids.get(cell.from.id);
        const codomainEid = cell.to && objectEids.get(cell.to.id);
        const queryAttribute = queryAttributes.get(cell.id);
        if (
            eid === undefined ||
            domainEid === undefined ||
            codomainEid === undefined ||
            queryAttribute === undefined
        ) {
            continue;
        }
        const label = cell.label || "(unnamed)";
        const entityLabel = cell.from?.label || "(unnamed entity)";
        datoms.push(
            [eid, dataScriptAttributes.schemaId, cell.id],
            [eid, dataScriptAttributes.label, label],
            [eid, dataScriptAttributes.kind, kind],
            [eid, dataScriptAttributes.domain, domainEid],
            [eid, dataScriptAttributes.codomain, codomainEid],
            [eid, dataScriptAttributes.queryAttribute, queryAttribute],
        );
        attributes.push({ attribute: queryAttribute, entityLabel, label, kind, schemaId: cell.id });
    }

    const danglingEids = new Map<string, number>();
    const danglingEid = (rowId: string) => {
        const existing = danglingEids.get(rowId);
        if (existing !== undefined) {
            return existing;
        }
        const eid = nextEid++;
        danglingEids.set(rowId, eid);
        datoms.push(
            [eid, dataScriptAttributes.rowId, rowId],
            [eid, dataScriptAttributes.dangling, true],
        );
        return eid;
    };

    for (const { entity, row, rowId } of rows) {
        const eid = rowEids.get(rowId);
        const entityEid = objectEids.get(entity.id);
        if (eid === undefined || entityEid === undefined) {
            continue;
        }
        datoms.push(
            [eid, dataScriptAttributes.rowId, rowId],
            [eid, dataScriptAttributes.entity, entityEid],
        );

        for (const { cell, kind } of morphisms) {
            if (cell.from?.id !== entity.id) {
                continue;
            }
            const queryAttribute = queryAttributes.get(cell.id);
            if (!queryAttribute) {
                continue;
            }
            const value = doc.rowValue(entity, row, cell.id);
            if (value === undefined) {
                continue;
            }
            if (kind === "mapping") {
                const targetRowId = doc.rowReferenceId(entity, row, cell.id);
                if (targetRowId !== undefined) {
                    datoms.push([
                        eid,
                        queryAttribute,
                        rowEids.get(targetRowId) ?? danglingEid(targetRowId),
                    ]);
                }
            } else if (
                typeof value === "string" ||
                typeof value === "number" ||
                typeof value === "boolean"
            ) {
                datoms.push([eid, queryAttribute, value]);
            }
        }
    }

    const schema: Record<string, Record<string, unknown>> = {
        [dataScriptAttributes.schemaId]: { ":db/unique": ":db.unique/identity" },
        [dataScriptAttributes.rowId]: { ":db/unique": ":db.unique/identity" },
        [dataScriptAttributes.entity]: { ":db/valueType": ":db.type/ref" },
        [dataScriptAttributes.domain]: { ":db/valueType": ":db.type/ref" },
        [dataScriptAttributes.codomain]: { ":db/valueType": ":db.type/ref" },
    };
    for (const attribute of attributes) {
        if (attribute.kind === "mapping") {
            schema[attribute.attribute] = { ":db/valueType": ":db.type/ref" };
        }
    }

    return { db: init_db(datoms, schema), attributes };
}

export type QueryTable = {
    columns: string[];
    rows: unknown[][];
};

/** Run an EDN Datalog query and normalize DataScript's find shapes for a table. */
export function queryDataScript(projection: DataScriptProjection, source: string): QueryTable {
    const value = q(source, projection.db);
    const columns = findColumns(source);
    if (!Array.isArray(value)) {
        return { columns: [columns[0] ?? "Result"], rows: [[value]] };
    }
    if (value.length === 0) {
        return { columns: columns.length > 0 ? columns : ["Result"], rows: [] };
    }
    if (value.every(Array.isArray)) {
        const width = Math.max(...value.map((row) => row.length));
        return {
            columns: Array.from(
                { length: width },
                (_, index) => columns[index] ?? `Column ${index + 1}`,
            ),
            rows: value,
        };
    }
    if (columns.length > 1 && !source.match(/:find\s+\[\s*\?[^\]]+\.\.\./s)) {
        return { columns, rows: [value] };
    }
    return { columns: [columns[0] ?? "Result"], rows: value.map((item) => [item]) };
}

function findColumns(source: string): string[] {
    const find = source.match(/:find\s+([\s\S]*?)(?=\s+:(?:in|where|with)\b|\]\s*$)/)?.[1] ?? "";
    const names = Array.from(find.matchAll(/\?([\w-]+)/g), (match) => match[1] ?? "");
    return [...new Set(names)];
}

function uniqueSegments(items: Array<{ id: string; label: string }>): Map<string, string> {
    const bases = items.map((item) => ({ ...item, base: querySegment(item.label) }));
    const counts = new Map<string, number>();
    for (const { base } of bases) {
        counts.set(base, (counts.get(base) ?? 0) + 1);
    }
    return new Map(
        bases.map(({ id, base }) => [id, counts.get(base) === 1 ? base : `${base}-${shortId(id)}`]),
    );
}

function querySegment(label: string): string {
    const segment = label
        .trim()
        .replace(/[^A-Za-z0-9_.-]+/g, "-")
        .replace(/^-+|-+$/g, "");
    return segment || "unnamed";
}

function shortId(id: string): string {
    return id.replaceAll("-", "").slice(-8);
}
