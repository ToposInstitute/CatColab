import assert from "node:assert";
import { it, test } from "node:test";
import { Persistence } from "./persistence.js";

test("Persistence API", async (_t) => {
    const url = process.env.TEST_DATABASE_URL;
    if (!url) {
        assert.fail("must supply connection string with environment variable TEST_DATABASE_URL");
    }
    const p = new Persistence(url);
    await p.teardown("./migrations");
    await p.migrate("./migrations");

    const s1 = await p.saveSnapshot("snapshot1");
    const s2 = await p.saveSnapshot("snapshot1");

    await it("saveSnapshot should return id as number", () => {
        assert.strictEqual(typeof s1, "number");
        assert.strictEqual(typeof s2, "number");
    });

    await it("saveSnapshot should deduplicate", () => {
        assert.strictEqual(s1, s2);
    });

    const s3 = await p.saveSnapshot("snapshot2");

    await it("saveSnapshot should not have hash-collisions", () => {
        assert.notDeepStrictEqual(s1, s3);
    });

    const r1 = await p.newRef("");

    await p.autosave(r1, "snapshot1");

    await p.saveRef(r1, "init");

    await it("newRef should return UUID as a string", () => {
        assert.strictEqual(typeof r1, "string");
    });

    const r2 = await p.newRef("My Document");

    await p.autosave(r2, "snapshot1");

    const w1 = await p.saveRef(r2, "init");

    p.autosave(r2, "snapshot2");

    const w2 = await p.saveRef(r2, "update");

    const m2 = await p.refMeta(r2);

    await it("title stored correctly", () => {
        assert.strictEqual(m2.title, "My Document");
    });

    await it("witnesses stored correctly", () => {
        assert.strictEqual(m2.witnesses[0].id, w1);
        assert.strictEqual(m2.witnesses[0].snapshot, s1);
        assert.strictEqual(m2.witnesses[1].id, w2);
        assert.strictEqual(m2.witnesses[1].snapshot, s3);
    });

    await it("latest snapshot is correct", async () => {
        assert.strictEqual(await p.getAutosave(r2), "snapshot2");
    });

    await it("all refs returns all refs ordered by last update", async () => {
        const refs = await p.allRefs();
        assert.strictEqual(refs[1].id, r1);
        assert.strictEqual(refs[0].id, r2);
    });

    const docWithExtern = {
        title: "Untitled",
        forRef: {
            __extern__: {
                refId: r2,
                taxon: "analysis",
                via: null,
            },
        },
    };

    await p.autosaveWithExterns(r1, docWithExtern);

    await it("correctly saved externs", async () => {
        assert.deepStrictEqual(await p.getBacklinks(r2, "analysis"), [r1]);
    });

    p.close();
});
