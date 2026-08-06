import { Entity, SimpleSchema } from "catcolab-logics/simple-schema";
import { describe, expect, test } from "vitest";

// RFC-0006 "Transactions": a set of changes staged on a draft, invisible on the
// source notebook until committed, and revertible as a whole via the returned
// commit.
import { createBinder } from "catcolab-documents";

describe("transactions", () => {
    test("changes stage on the transaction, apply on commit and revert as a batch", async () => {
        const binder = createBinder();
        const schema = await binder.createNotebook(SimpleSchema, { title: "Example schema" });

        const tx = schema.beginTransaction();
        tx.add(Entity, { label: "Person" });
        tx.add(Entity, { label: "Company" });

        expect(schema.cellsOf(Entity).length).toBe(0);
        expect(tx.cellsOf(Entity).length).toBe(2);

        const commit = tx.commit();
        expect(
            schema
                .cellsOf(Entity)
                .map((cell) => cell.label)
                .join(", "),
        ).toBe("Person, Company");

        schema.revertCommit(commit);
        expect(schema.cellsOf(Entity).length).toBe(0);
    });
});
