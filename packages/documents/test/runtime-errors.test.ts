import { PetriNet, Place, Transition } from "catcolab-logics/petri-net";
import { Aspect, SimpleOlog, Type } from "catcolab-logics/simple-olog";
import { AttrType, Mapping, SimpleSchema } from "catcolab-logics/simple-schema";
import { describe, expect, test } from "vitest";

// RFC-0006 "Runtime errors" and "Further runtime errors".
//
// Since the API can also be used from JavaScript directly without type
// checking, the same invalid inputs that TypeScript catches are also rejected
// at runtime. Each one throws an error carrying a Standard Schema compatible
// `issues` array. (The `as never` casts bypass the static checks that
// type-errors.test-d.ts covers.)
import { createBinder } from "catcolab-documents";

/** Run `fn`, expecting it to throw an error with a Standard Schema compatible
 * `issues` array; returns the joined issue messages. */
function issuesOf(fn: () => unknown): string {
    try {
        fn();
    } catch (error) {
        const issues = (error as { issues?: { message: string }[] }).issues;
        if (!issues) {
            throw new Error("Expected the thrown error to carry an `issues` array.", {
                cause: error,
            });
        }
        return issues.map((issue) => issue.message).join("; ");
    }
    throw new Error("Expected the call to throw.");
}

describe("runtime errors", () => {
    test("invalid shapes throw with a Standard Schema compatible issues array", async () => {
        const binder = createBinder();
        const notebook = await binder.createNotebook(SimpleOlog, { title: "An Olog" });

        const source = notebook.add(Type, { label: "A" });
        const target = notebook.add(Type, { label: "B" });
        const arrow = notebook.add(Aspect, { label: "has", from: source, to: target });

        // Arrays are not valid endpoints in a simple olog.
        expect(issuesOf(() => arrow.update({ from: [source] } as never))).toBe(
            "`from` must be an object cell or null (was an array)",
        );

        // Arrays are not valid endpoints in a simple olog.
        expect(
            issuesOf(() =>
                notebook.add(Aspect, { label: "bad", from: [source, target], to: target } as never),
            ),
        ).toBe("`from` must be an object cell or null (was an array)");

        // Missing required fields.
        expect(issuesOf(() => notebook.add(Aspect, {} as never))).toBe(
            "`from` must be an object cell or null (was missing); " +
                "`label` must be a string or null (was missing); " +
                "`to` must be an object cell or null (was missing)",
        );

        // null fields are allowed.
        expect(() => notebook.add(Aspect, { label: null, from: null, to: null })).not.toThrow();
    });

    test("a mapping's endpoints must be entities, not attribute types", async () => {
        const binder = createBinder();
        const schema = await binder.createNotebook(SimpleSchema, { title: "Example schema" });

        const str = schema.add(AttrType, { label: "String" });

        expect(
            issuesOf(() => schema.add(Mapping, { label: "bad", from: str, to: str } as never)),
        ).toBe(
            "`from` must be an object cell of type Entity (was an object cell of type AttrType); " +
                "`to` must be an object cell of type Entity (was an object cell of type AttrType)",
        );
    });

    test("validation adapts to the underlying logic", async () => {
        const binder = createBinder();
        const notebook = await binder.createNotebook(PetriNet, { title: "Example Petri-net" });

        const a = notebook.add(Place, { label: "A" });
        const c = notebook.add(Place, { label: "C" });

        // Petri net transitions require arrays of places.
        expect(
            issuesOf(() => notebook.add(Transition, { label: "bad", from: a, to: [c] } as never)),
        ).toBe("`from` must be an array or null (was an object cell of type Object)");
    });
});
