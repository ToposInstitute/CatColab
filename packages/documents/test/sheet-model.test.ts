import { Attr, Entity, Mapping } from "catcolab-logics/simple-schema";
import { describe, expect, test } from "vitest";

import { isRow } from "catcolab-documents";
import { createDemoDocument } from "../demo/src/document";
import {
    cellParsesAs,
    countUnparseable,
    inferAttrType,
    insertColumnEntries,
    linkTag,
    parseCellValue,
    parsePersistedSheet,
    planTableFromColumns,
    removeColumnEntries,
    removeColumns,
    setColumnEntry,
    trimColumnEntries,
    trimSheetData,
} from "../demo/src/sheet-model";

describe("scalar type inference", () => {
    test("infers the narrowest type accepting every non-blank value", () => {
        expect(inferAttrType(["true", "FALSE", ""])).toBe("Boolean");
        expect(inferAttrType(["1", "-3", "42"])).toBe("Integer");
        expect(inferAttrType(["1.5", "2", ""])).toBe("Float");
        expect(inferAttrType(["1", "hello"])).toBe("String");
    });

    test("mixed booleans and numbers fall back to String", () => {
        expect(inferAttrType(["true", "1"])).toBe("String");
    });

    test("all-blank columns are Strings", () => {
        expect(inferAttrType(["", "  ", ""])).toBe("String");
    });

    test("integers outside the i32 range are Floats", () => {
        expect(inferAttrType(["3000000000"])).toBe("Float");
    });
});

describe("cell parsing", () => {
    test("blanks are unset for every type", () => {
        for (const type of ["String", "Boolean", "Integer", "Float"] as const) {
            expect(parseCellValue("  ", type)).toBeUndefined();
            expect(cellParsesAs("", type)).toBe(true);
        }
    });

    test("parses by type and rejects mismatches", () => {
        expect(parseCellValue("true", "Boolean")).toBe(true);
        expect(parseCellValue("no", "Boolean")).toBeUndefined();
        expect(parseCellValue("14", "Integer")).toBe(14);
        expect(parseCellValue("14.9", "Integer")).toBeUndefined();
        expect(parseCellValue("14.9", "Float")).toBe(14.9);
        expect(parseCellValue("1e40", "Float")).toBeUndefined();
        expect(parseCellValue(" kept verbatim ", "String")).toBe(" kept verbatim ");
    });

    test("counts the values a type override would drop", () => {
        expect(countUnparseable(["1", "2.5", "", "x"], "Integer")).toBe(2);
        expect(countUnparseable(["1", "2.5", "", "x"], "String")).toBe(0);
    });
});

describe("table planning", () => {
    const data = [
        ["", "", "", ""],
        ["", "Mars", "3389.5", "false"],
        ["", "", "", ""],
        ["", "Earth", "6371", "true"],
        ["stray", "", "", ""],
    ];

    test("every content row is data; blank rows are skipped", () => {
        const plan = planTableFromColumns(data, { start: 1, end: 3 });
        expect(plan.columns.map((column) => column.proposedType)).toEqual([
            "String",
            "Float",
            "Boolean",
        ]);
        expect(plan.rows).toEqual([
            ["Mars", "3389.5", "false"],
            ["Earth", "6371", "true"],
        ]);
    });

    test("content outside the selected columns is ignored", () => {
        const plan = planTableFromColumns(data, { start: 1, end: 3 });
        expect(plan.rows.some((row) => row.includes("stray"))).toBe(false);
    });

    test("untitled columns are named by their sheet letters", () => {
        const plan = planTableFromColumns(data, { start: 1, end: 3 });
        expect(plan.columns.map((column) => column.name)).toEqual(["B", "C", "D"]);
    });

    test("an empty selection plans an empty table", () => {
        const plan = planTableFromColumns([[""]], { start: 0, end: 0 });
        expect(plan.rows).toEqual([]);
        expect(plan.columns).toHaveLength(1);
        expect(plan.columns[0]?.proposedType).toBe("String");
    });

    test("an explicit column tag wins over inference; null falls back", () => {
        const plan = planTableFromColumns(data, { start: 1, end: 3 }, [
            null,
            null,
            "String", // radius: tagged String although the data infers Float
            null, // habitable: untagged, inference keeps Boolean
        ]);
        expect(plan.columns.map((column) => column.proposedType)).toEqual([
            "String",
            "String",
            "Boolean",
        ]);
    });

    test("a link tag passes through as the proposed type", () => {
        const plan = planTableFromColumns(data, { start: 1, end: 1 }, [
            null,
            linkTag("some-entity"),
        ]);
        expect(plan.columns[0]?.proposedType).toBe("link:some-entity");
    });

    test("explicit titles name their columns; the rest keep their letters", () => {
        const plan = planTableFromColumns(
            data,
            { start: 1, end: 3 },
            undefined,
            [null, "planet", null, null], // only the first selected column titled
        );
        expect(plan.columns.map((column) => column.name)).toEqual(["planet", "C", "D"]);
        expect(plan.rows).toHaveLength(2);
    });
});

describe("sheet data manipulation", () => {
    test("removeColumns drops the range from every row, ragged rows included", () => {
        expect(
            removeColumns(
                [
                    ["a", "b", "c", "d"],
                    ["e", "f"],
                ],
                { start: 1, end: 2 },
            ),
        ).toEqual([["a", "d"], ["e"]]);
    });

    test("trimSheetData drops trailing blank rows and cells", () => {
        expect(
            trimSheetData([
                ["a", "", ""],
                ["", "", ""],
                ["b", "c", " "],
                ["", "", ""],
            ]),
        ).toEqual([["a"], [], ["b", "c"]]);
    });

    test("parsePersistedSheet round-trips cells, types, and titles", () => {
        const state = {
            cells: [["a", "b"], ["c"]],
            types: ["Integer", null, "link:abc-123"],
            titles: [null, "planet"],
        };
        expect(parsePersistedSheet(JSON.stringify(state))).toEqual(state);
        expect(parsePersistedSheet(null)).toBeUndefined();
        expect(parsePersistedSheet("not json")).toBeUndefined();
        expect(parsePersistedSheet('{"rows":1}')).toBeUndefined();
        // Unknown type names are dropped to auto, blank titles to untitled.
        expect(
            parsePersistedSheet('{"cells":[["a"]],"types":["Decimal"],"titles":["  "]}'),
        ).toEqual({
            cells: [["a"]],
            types: [null],
            titles: [null],
        });
    });

    test("parsePersistedSheet reads the earlier formats", () => {
        expect(parsePersistedSheet('[["a",1],"x"]')).toEqual({
            cells: [["a", ""], []],
            types: [],
            titles: [],
        });
        expect(parsePersistedSheet('{"cells":[["a"]],"types":["Integer"]}')).toEqual({
            cells: [["a"]],
            types: ["Integer"],
            titles: [],
        });
    });

    test("column metadata shifts with inserts, deletes, and claims", () => {
        const types = setColumnEntry(setColumnEntry([], 0, "Integer"), 2, "Boolean");
        expect(types).toEqual(["Integer", null, "Boolean"]);

        expect(insertColumnEntries(types, 1, 2)).toEqual(["Integer", null, null, null, "Boolean"]);
        // Inserts past the tagged range change nothing.
        expect(insertColumnEntries(types, 3, 1)).toEqual(types);

        expect(removeColumnEntries(types, { start: 0, end: 1 })).toEqual(["Boolean"]);
        expect(setColumnEntry(types, 2, null)).toEqual(["Integer"]);
        expect(trimColumnEntries(["Integer", null, null])).toEqual(["Integer"]);
    });
});

describe("sheet table creation", () => {
    test("creates the entity, attributes, and rows, undone as one step", async () => {
        localStorage.clear();
        const doc = await createDemoDocument();

        const plan = planTableFromColumns(
            [
                ["Mars", "3389.5", "false"],
                ["Earth", "6371", "true"],
            ],
            { start: 0, end: 2 },
            undefined,
            ["name", "radius", "habitable"],
        );
        const entity = doc.applySheetTableCreation({
            entityName: "Planet",
            columns: plan.columns.map((column) => ({
                name: column.name,
                type: column.proposedType,
            })),
            rows: plan.rows,
        });

        expect(entity.label).toBe("Planet");
        expect(doc.schema.cellsOf(Entity).some((cell) => cell.id === entity.id)).toBe(true);
        const attrs = doc.schema.cellsOf(Attr).filter((cell) => cell.from?.id === entity.id);
        expect(attrs.map((cell) => cell.label)).toEqual(["name", "radius", "habitable"]);
        expect(attrs.map((cell) => cell.to?.label)).toEqual(["String", "Float", "Boolean"]);

        const rows = doc.instance.rowsOf(entity);
        expect(rows).toHaveLength(2);
        const name = attrs[0]!;
        const radius = attrs[1]!;
        const habitable = attrs[2]!;
        expect(rows.map((row) => row.get(name))).toEqual(["Mars", "Earth"]);
        expect(rows.map((row) => row.get(radius))).toEqual([
            Math.fround(3389.5),
            Math.fround(6371),
        ]);
        expect(rows.map((row) => row.get(habitable))).toEqual([false, true]);

        // One undo removes the whole table from both documents together.
        doc.schemaHistory.onUndo();
        expect(doc.schema.cellsOf(Entity).some((cell) => cell.id === entity.id)).toBe(false);
        expect(doc.instance.rowsOf(entity)).toHaveLength(0);

        doc.instanceHistory.onRedo();
        expect(doc.schema.cellsOf(Entity).some((cell) => cell.id === entity.id)).toBe(true);
        expect(doc.instance.rowsOf(entity)).toHaveLength(2);
    });

    test("link columns become mappings with references resolved by value", async () => {
        localStorage.clear();
        const doc = await createDemoDocument();

        const planet = doc.applySheetTableCreation({
            entityName: "Planet",
            columns: [{ name: "name", type: "String" }],
            rows: [["Mars"], ["Jupiter"]],
        });

        const moon = doc.applySheetTableCreation({
            entityName: "Moon",
            columns: [
                { name: "name", type: "String" },
                { name: "orbits", type: linkTag(planet.id) },
            ],
            rows: [
                ["Phobos", "Mars"],
                ["Io", "Jupiter"],
                ["Luna", "Earth"], // No such planet: the reference stays unset.
            ],
        });

        const orbits = doc.schema.cellsOf(Mapping).find((cell) => cell.from?.id === moon.id);
        expect(orbits?.label).toBe("orbits");
        expect(orbits?.to?.label).toBe("Planet");

        const planetRows = doc.instance.rowsOf(planet);
        const targets = doc.instance.rowsOf(moon).map((row) => {
            const value = row.get(orbits!);
            return isRow(value) ? value.id : undefined;
        });
        expect(targets).toEqual([planetRows[0]?.id, planetRows[1]?.id, undefined]);

        // One undo removes the Moon table, its mapping, and its rows together.
        doc.schemaHistory.onUndo();
        expect(doc.schema.cellsOf(Mapping).some((cell) => cell.from?.id === moon.id)).toBe(false);
        expect(doc.instance.rowsOf(moon)).toHaveLength(0);
        expect(doc.instance.rowsOf(planet)).toHaveLength(2);
    });

    test("a link column whose target table is gone fails cleanly", async () => {
        localStorage.clear();
        const doc = await createDemoDocument();

        expect(() =>
            doc.applySheetTableCreation({
                entityName: "Moon",
                columns: [{ name: "orbits", type: linkTag("no-such-entity") }],
                rows: [["Mars"]],
            }),
        ).toThrow(/no longer exists/);
        // The rollback leaves no half-created entity behind.
        expect(doc.schema.cellsOf(Entity).some((cell) => cell.label === "Moon")).toBe(false);
    });

    test("unparseable values are left unset", async () => {
        localStorage.clear();
        const doc = await createDemoDocument();

        const entity = doc.applySheetTableCreation({
            entityName: "Reading",
            columns: [{ name: "value", type: "Integer" }],
            rows: [["12"], ["12.5"], ["oops"]],
        });

        const value = doc.schema.cellsOf(Attr).find((cell) => cell.from?.id === entity.id)!;
        expect(doc.instance.rowsOf(entity).map((row) => row.get(value))).toEqual([
            12,
            undefined,
            undefined,
        ]);
    });
});
