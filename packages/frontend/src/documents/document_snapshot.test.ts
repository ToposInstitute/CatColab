import { change, from } from "@automerge/automerge";
import { describe, expect, test } from "vitest";

import { Model } from "catcolab-document-methods";
import { createDocumentSnapshotReader } from "./document_snapshot";

describe("createDocumentSnapshotReader", () => {
    test("reuses snapshots by Automerge version identity without changing old snapshots", () => {
        const getCachedSnapshot = createDocumentSnapshotReader();
        const original = from({ ...Model.newModelDocument({ theory: "simple-olog" }) });
        const before = getCachedSnapshot(original);

        expect(getCachedSnapshot(original)).toBe(before);
        expect(before).not.toBe(original);
        expect(structuredClone(before)).toEqual(before);

        const changed = change(original, (document) => {
            document.name = "Renamed";
        });
        const after = getCachedSnapshot(changed);

        expect(after).not.toBe(before);
        expect(after.name).toBe("Renamed");
        expect(before.name).toBe("");
        expect(getCachedSnapshot(changed)).toBe(after);
        expect(getCachedSnapshot(original)).toBe(before);
    });
});
