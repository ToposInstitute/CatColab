import { describe, expect, test } from "vitest";

import {
    emptyTableLayout,
    mergeVisibleOrder,
    moveItem,
    parseTableLayout,
    reconcileTableLayout,
} from "../demo/src/table-layout";

describe("table layout", () => {
    test("appends new IDs and retains removed IDs for schema undo", () => {
        const first = reconcileTableLayout(emptyTableLayout(), [
            { id: "people", columnIds: ["name", "age"] },
            { id: "pets", columnIds: ["species"] },
        ]);
        expect(first.hiddenTables).toEqual(["people", "pets"]);

        first.tableOrder = ["pets", "people"];
        first.hiddenTables = first.hiddenTables.filter((id) => id !== "people");
        first.columns["people"] = { order: ["age", "name"], hidden: ["age"] };

        const afterDelete = reconcileTableLayout(first, [
            { id: "people", columnIds: ["name"] },
            { id: "places", columnIds: ["city"] },
        ]);
        const afterUndo = reconcileTableLayout(afterDelete, [
            { id: "people", columnIds: ["name", "age"] },
            { id: "pets", columnIds: ["species"] },
            { id: "places", columnIds: ["city"] },
        ]);

        expect(afterUndo.tableOrder).toEqual(["pets", "people", "places"]);
        expect(afterUndo.hiddenTables).toEqual(["pets", "places"]);
        expect(afterUndo.columns["people"]).toEqual({
            order: ["age", "name"],
            hidden: ["age"],
        });
    });

    test("moves an item before or after a target", () => {
        expect(moveItem(["a", "b", "c"], "a", "c", "after")).toEqual(["b", "c", "a"]);
        expect(moveItem(["a", "b", "c"], "c", "a", "before")).toEqual(["c", "a", "b"]);
    });

    test("reorders visible columns while preserving hidden slots", () => {
        expect(mergeVisibleOrder(["a", "hidden", "b", "c"], ["c", "a", "b"])).toEqual([
            "c",
            "hidden",
            "a",
            "b",
        ]);
    });

    test("discards malformed nested persisted data", () => {
        const malformed = JSON.stringify({
            version: 1,
            tableOrder: ["people"],
            hiddenTables: [],
            columns: { people: { order: 42, hidden: null } },
        });

        expect(parseTableLayout(malformed)).toEqual(emptyTableLayout());
    });
});
