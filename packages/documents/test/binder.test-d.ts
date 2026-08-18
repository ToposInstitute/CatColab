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
});
