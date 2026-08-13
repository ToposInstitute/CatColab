import { PetriNet, Place, Transition } from "catcolab-logics/petri-net";
import { AttrType, Entity, Mapping, SimpleSchema } from "catcolab-logics/simple-schema";
import { describe, expect, test } from "vitest";

import { createBinder } from "catcolab-documents";

const binder = createBinder();

// The typed `add` API catches endpoint mistakes at *compile time* (see
// `typed_api_endpoint_safety.lts.md`). But a plain-JavaScript caller gets no
// TypeScript checking, so those same mistakes would slip through and silently
// corrupt the document. These tests call the documents API from untyped JS with
// the three classes of endpoint mistake and assert that each is rejected at
// runtime.
//
// Error contract: `add` throws on invalid input, and the thrown error carries a
// Standard Schema (https://standardschema.dev) shaped `issues` array — each
// issue an `{ message, path? }` — so callers inspect failures vendor-neutrally
// without importing anything validator-specific.
//
// The runtime `add` (src/binder.ts) validates its arguments with ArkType and
// throws a `ValidationError` carrying
// that `issues` array, so each call below is rejected rather than silently
// corrupting the document.

/**
 * Assert that `fn` throws an error carrying a Standard Schema `issues` array.
 */
function expectValidationError(fn) {
    let thrown;
    try {
        fn();
    } catch (error) {
        thrown = error;
    }
    expect(thrown, "expected a validation error to be thrown").toBeDefined();
    // The failure surfaces a Standard Schema `FailureResult.issues`: a non-empty
    // array of issues, each with a string `message` (and an optional `path`).
    expect(Array.isArray(thrown.issues), "thrown error should carry an `issues` array").toBe(true);
    expect(thrown.issues.length).toBeGreaterThan(0);
    for (const issue of thrown.issues) {
        expect(typeof issue.message).toBe("string");
        // `path` is optional; when present it must be an array. Asserted
        // unconditionally (rather than inside an `if`) so the expectation always
        // runs — the tests calling this are async, and a conditional `expect`
        // there is flagged by `vitest/no-conditional-expect`.
        expect(issue.path === undefined || Array.isArray(issue.path)).toBe(true);
    }
}

describe("documents API runtime validation from JS", () => {
    test("Bug 1: an endpoint of the wrong object type is rejected at runtime", async () => {
        const notebook = await binder.createNotebook(SimpleSchema, { title: "Schema" });
        const person = notebook.add(Entity, { label: "Person" });
        const age = notebook.add(AttrType, { label: "Age" });

        // A Mapping's codomain must be an Entity cell, not an AttrType cell.
        expectValidationError(() => {
            notebook.add(Mapping, { label: "broken", from: person, to: age });
        });
    });

    test("Bug 2: a single object where an endpoint list is required is rejected at runtime", async () => {
        const notebook = await binder.createNotebook(PetriNet, { title: "Net" });
        const a = notebook.add(Place, { label: "A" });
        const c = notebook.add(Place, { label: "C" });

        // A transition endpoint is an array of Place cells, not a single Place.
        expectValidationError(() => {
            notebook.add(Transition, { label: "fires", from: a, to: [c] });
        });
    });

    test("Bug 3: a cell from another theory is rejected at runtime", async () => {
        const net = await binder.createNotebook(PetriNet, { title: "Net" });
        const place = net.add(Place, { label: "A place" });

        const schema = await binder.createNotebook(SimpleSchema, { title: "Schema" });
        const person = schema.add(Entity, { label: "Person" });

        // `place` is a Place cell from another theory; a Mapping endpoint needs
        // an Entity cell.
        expectValidationError(() => {
            schema.add(Mapping, { label: "tangled", from: person, to: place });
        });
    });

    test("a missing required field is rejected at runtime", async () => {
        const notebook = await binder.createNotebook(SimpleSchema, { title: "Schema" });

        // An object cell requires a `label`; omitting it should be a validation
        // error rather than a cell with `label: undefined`.
        expectValidationError(() => {
            notebook.add(Entity, {});
        });
    });
});
