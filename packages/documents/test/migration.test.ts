import { Aspect, SimpleOlog, Type } from "catcolab-logics/simple-olog";
import { Entity, Mapping, SimpleSchema } from "catcolab-logics/simple-schema";
import { describe, expect, test } from "vitest";

// RFC-0006 "Migrating between logics": `migrateTo` rewrites the document in
// place and returns a `Result` carrying a notebook of the target shape.
import { createBinder } from "catcolab-documents";

describe.skip("migrating between logics", () => {
    test("migrateTo rewrites an olog into a schema in place", async () => {
        const binder = createBinder();
        const olog = await binder.createNotebook(SimpleOlog, { title: "An Olog" });

        const a = olog.add(Type, { label: "A" });
        const b = olog.add(Type, { label: "B" });
        olog.add(Aspect, { label: "has", from: a, to: b });

        const migration = await olog.migrateTo(SimpleSchema);
        expect(migration.tag).toBe("Ok");
        if (migration.tag !== "Ok") {
            return;
        }
        const schema = migration.content;

        // The original document was rewritten in place, not copied.
        expect(schema.document === olog.document).toBe(true);
        expect(schema.document.theory).toBe("simple-schema");
        expect(
            schema
                .cellsOf(Entity)
                .map((cell) => cell.label)
                .join(", "),
        ).toBe("A, B");
        expect(
            schema
                .cellsOf(Mapping)
                .map((cell) => cell.label)
                .join(", "),
        ).toBe("has");
        expect((await schema.validate()).issues).toEqual([]);
    });
});
