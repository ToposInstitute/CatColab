import { Attr, AttrType, Entity, SimpleSchema } from "catcolab-logics/simple-schema";
import { describe, expect, test } from "vitest";

import { createBinder, type ObjectCell, type TableRow } from "catcolab-documents";
import {
    classifyFloatToIntegerValue,
    I32_MAX,
    I32_MIN,
    planFloatToIntegerMigration,
    planFloatToIntegerValues,
} from "../demo/src/attribute-type-migration";
import { createDemoDocument } from "../demo/src/document";
import { loadExampleData } from "../demo/src/example-data";
import { createLocalHistory, pairHistories } from "../demo/src/history";

describe("Float-to-Integer migration planning", () => {
    test("retains integers and explicitly represents unset values", () => {
        expect(classifyFloatToIntegerValue(12, "round")).toEqual({
            classification: "unchanged",
            input: 12,
            output: 12,
        });
        expect(classifyFloatToIntegerValue(undefined, "round")).toEqual({
            classification: "unchanged",
            input: undefined,
            output: undefined,
        });
        expect(classifyFloatToIntegerValue(I32_MIN, "truncate").output).toBe(I32_MIN);
        expect(classifyFloatToIntegerValue(I32_MAX, "truncate").output).toBe(I32_MAX);
    });

    test("rounds, truncates, or clears fractional values", () => {
        expect(classifyFloatToIntegerValue(14.9, "round")).toMatchObject({
            classification: "converted",
            output: 15,
        });
        expect(classifyFloatToIntegerValue(-14.9, "truncate")).toMatchObject({
            classification: "converted",
            output: -14,
        });
        expect(classifyFloatToIntegerValue(14.9, "clear")).toMatchObject({
            classification: "cleared",
            output: undefined,
        });
        expect(classifyFloatToIntegerValue("invalid", "clear")).toMatchObject({
            classification: "cleared",
            output: undefined,
        });
        expect(classifyFloatToIntegerValue(I32_MAX + 1, "clear")).toMatchObject({
            classification: "cleared",
            output: undefined,
        });
    });

    test("leaves unsupported, non-finite, and out-of-range values unresolved", () => {
        expect(classifyFloatToIntegerValue("12.5", "round")).toMatchObject({
            classification: "unresolved",
            reason: "unsupported",
        });
        expect(classifyFloatToIntegerValue(Number.NaN, "round")).toMatchObject({
            classification: "unresolved",
            reason: "non-finite",
        });
        expect(classifyFloatToIntegerValue(I32_MAX + 1, "round")).toMatchObject({
            classification: "unresolved",
            reason: "out-of-range",
        });
        expect(classifyFloatToIntegerValue(I32_MAX + 0.75, "round")).toMatchObject({
            classification: "unresolved",
            reason: "out-of-range",
        });
        expect(classifyFloatToIntegerValue(I32_MAX + 0.75, "truncate")).toMatchObject({
            classification: "converted",
            output: I32_MAX,
        });
    });

    test("summarizes an aligned value plan and blocks unresolved plans", () => {
        const plan = planFloatToIntegerValues([1, 1.4, undefined, "bad"], "round");

        expect(plan.values.map((value) => value.output)).toEqual([1, 1, undefined, undefined]);
        expect(plan.summary).toEqual({
            total: 4,
            affected: 2,
            unchanged: 2,
            converted: 1,
            cleared: 0,
            unresolved: 1,
        });
        expect(plan.canApply).toBe(false);
    });

    test("plans document rows by attribute UUID without mutating them", async () => {
        const binder = createBinder();
        const schema = await binder.createNotebook(SimpleSchema, { title: "Schema" });
        const entity = schema.add(Entity, { label: "Measurement" });
        const float = schema.add(AttrType, { label: "Float" });
        const reading = schema.add(Attr, { label: "reading", from: entity, to: float });
        const instance = await binder.createInstance(schema, { title: "Instance" });
        const table = instance.tables.find((candidate) => candidate.id === entity.id)!;
        table.addRow();
        const fractional = table.addRow();
        table.addRow();
        const ids = instance.document.tables[entity.id]!.rowOrder;
        const values = [3, Math.fround(3.8), undefined];
        const adapter = {
            rowsOf: () => table.rows,
            rowId: (_entity: ObjectCell, row: TableRow) => ids[row.index],
            rowValue: (_entity: ObjectCell, row: TableRow) => values[row.index],
        };
        const storedFractionalValue = values[fractional.index];

        const plan = planFloatToIntegerMigration(adapter, reading, "truncate");

        expect(
            plan.rows.map(({ rowId, classification, input, output }) => ({
                rowId,
                classification,
                input,
                output,
            })),
        ).toEqual([
            { rowId: ids[0], classification: "unchanged", input: 3, output: 3 },
            {
                rowId: ids[1],
                classification: "converted",
                input: storedFractionalValue,
                output: 3,
            },
            { rowId: ids[2], classification: "unchanged", input: undefined, output: undefined },
        ]);
        expect(plan.summary).toMatchObject({ total: 3, unchanged: 2, converted: 1 });
        expect(plan.canApply).toBe(true);
        expect(values[fractional.index]).toBe(storedFractionalValue);
    });
});

describe("Float-to-Integer migration application", () => {
    test("applies schema and value changes and pairs undo and redo", async () => {
        localStorage.clear();
        const doc = await createDemoDocument();
        await loadExampleData(doc);
        await Promise.resolve();

        const temperature = doc.schema.cellsOf(Attr).find((cell) => cell.label === "temperature");
        if (!temperature) {
            throw new Error("Planets fixture has no temperature attribute.");
        }
        const earth = doc
            .rowsOf(temperature.from)
            .find(
                (row) => doc.rowValue(temperature.from!, row, temperature.id) === Math.fround(14.9),
            );
        if (!earth) {
            throw new Error("Planets fixture has no Earth temperature row.");
        }

        doc.applyFloatToIntegerMigration(temperature, "round");

        expect(temperature.to.label).toBe("Integer");
        expect(doc.rowValue(temperature.from!, earth, temperature.id)).toBe(15);

        doc.schemaHistory.onUndo();
        expect(temperature.to.label).toBe("Float");
        expect(doc.rowValue(temperature.from!, earth, temperature.id)).toBe(Math.fround(14.9));

        doc.instanceHistory.onRedo();
        expect(temperature.to.label).toBe("Integer");
        expect(doc.rowValue(temperature.from!, earth, temperature.id)).toBe(15);
    });

    test("applies manually edited values for every row", async () => {
        localStorage.clear();
        const doc = await createDemoDocument();
        await loadExampleData(doc);
        await Promise.resolve();

        const temperature = doc.schema.cellsOf(Attr).find((cell) => cell.label === "temperature");
        if (!temperature) {
            throw new Error("Planets fixture has no temperature attribute.");
        }
        const rows = doc.rowsOf(temperature.from);
        const values = new Map(
            rows.map((row, index) => [doc.rowId(temperature.from!, row)!, index]),
        );

        doc.applyFloatToIntegerMigration(temperature, "round", values);

        expect(rows.map((row) => doc.rowValue(temperature.from!, row, temperature.id))).toEqual(
            rows.map((_, index) => index),
        );
    });
});

describe("paired local history", () => {
    test("moves grouped checkpoints together from either history", () => {
        let schema = 0;
        let instance = 0;
        const schemaHistory = createLocalHistory({
            capture: () => schema,
            restore: (snapshot) => {
                schema = snapshot;
            },
            equal: (left, right) => left === right,
        });
        const instanceHistory = createLocalHistory({
            capture: () => instance,
            restore: (snapshot) => {
                instance = snapshot;
            },
            equal: (left, right) => left === right,
        });
        schemaHistory.recordNow();
        instanceHistory.recordNow();
        schema = 1;
        instance = 1;
        schemaHistory.recordNow("migration");
        instanceHistory.recordNow("migration");

        pairHistories(schemaHistory, instanceHistory).onUndo();
        expect({ schema, instance }).toEqual({ schema: 0, instance: 0 });

        pairHistories(instanceHistory, schemaHistory).onRedo();
        expect({ schema, instance }).toEqual({ schema: 1, instance: 1 });
    });
});
