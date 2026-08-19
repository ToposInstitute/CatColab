import { Entity, SimpleSchema } from "catcolab-logics/simple-schema";
import { describe, expectTypeOf, test } from "vitest";

import type { Document } from "catcolab-document-types";
// Type-level tests for the binder API. These cases are checked by the
// compiler only (vitest typecheck mode); nothing here executes.
import { createBinder, type Binder } from "catcolab-documents";

describe("binder type errors", () => {
    test("createBinder does not accept a type argument without a store", () => {
        interface InvalidHandle {
            bogus: true;
        }

        // @ts-expect-error An explicit handle type requires passing a store:
        // `createBinder<Handle>(store)`. The zero-argument overload takes no
        // type arguments.
        createBinder<InvalidHandle>();
    });

    test("createBinder without arguments is typed with the in-memory handle", () => {
        expectTypeOf(createBinder()).toEqualTypeOf<Binder<Document>>();
    });

    test("instance documents expose validation and validated instances expose tables", async () => {
        const binder = createBinder();
        const schema = await binder.createNotebook(SimpleSchema, { title: "Schema" });
        schema.add(Entity, { label: "Entity" });

        const instanceDoc = await binder.createInstance(schema, { title: "Instance" });
        instanceDoc.validate();
        // @ts-expect-error Unvalidated instance documents do not expose tables.
        void instanceDoc.tables;
        // @ts-expect-error Unvalidated instance documents do not expose queries.
        void instanceDoc.get;

        const validation = await instanceDoc.validate();
        if (validation.tag !== "Ok") {
            return;
        }
        const instance = validation.content.instance;
        void instance.tables;
        void instance.get;
        // @ts-expect-error Validated instances are not validation handles.
        instance.validate();
    });
});
