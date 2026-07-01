import type { StandardSchemaV1 } from "@standard-schema/spec";
import { type } from "arktype";
import type { ObType } from "catcolab-document-types";
import {
    CellKind,
    type MorEndpointMeta,
    type MorphismDef,
    type ObjectDef,
    sameTypeValue,
} from "./definitions";

/**
 * Runtime validation of {@link Notebook.add} arguments, built on ArkType
 * (https://arktype.io). The typed `add` API rejects endpoint mistakes at
 * *compile time*, but a plain-JavaScript caller gets no TypeScript checking, so
 * the same mistakes would slip through and silently corrupt the document. These
 * validators re-check the arguments at runtime and throw on the three classes of
 * endpoint mistake — an endpoint of the wrong object type, a single object where
 * a list is required (or vice versa), and a missing required field.
 *
 * Failures are reported through ArkType, whose error value is a Standard Schema
 * (https://standardschema.dev) `FailureResult`: an `issues` array, each issue an
 * `{ message, path? }`. {@link ValidationError} re-exposes that array on a thrown
 * `Error` so callers inspect failures vendor-neutrally without importing
 * anything validator-specific.
 *
 * TypeScript types are *derived from* the ArkType schemas with ArkType's
 * `type.infer`, so the schema is the single source of truth for both the runtime
 * check and the static shape.
 */

/**
 * A [Standard Schema](https://standardschema.dev) issue: a human-readable
 * `message` and an optional `path`. Aliased from the spec's own
 * {@link StandardSchemaV1.Issue}.
 */
export type Issue = StandardSchemaV1.Issue;

/**
 * A [Standard Schema](https://standardschema.dev) result: either a success
 * carrying the produced `value`, or a failure carrying an `issues` array.
 * Aliased from the spec's own {@link StandardSchemaV1.Result}, so callers can
 * branch on the presence of `issues` without importing anything
 * validator-specific.
 */
export type Result<T> = StandardSchemaV1.Result<T>;

/**
 * An error thrown when {@link Notebook.add} arguments fail validation. It is a
 * real `Error` (so it propagates and prints normally) that additionally carries
 * a Standard Schema `issues` array, mirroring ArkType's own failure result.
 */
export class ValidationError extends Error {
    readonly issues: ReadonlyArray<Issue>;

    constructor(issues: ReadonlyArray<Issue>) {
        super(issues.map((issue) => issue.message).join("; "));
        this.name = "ValidationError";
        this.issues = issues;
    }
}

/**
 * The ArkType schema for an object-cell endpoint: any cell whose `kind` is
 * {@link CellKind.Object}. The narrower per-type check (its `obType`) is layered
 * on with {@link endpointOfType}, since the expected object type is only known
 * for a particular morphism def.
 */
const objectCellSchema = type({
    kind: ["===", CellKind.Object],
    type: {
        tag: "'object'",
        "obType?": "unknown",
    },
    "+": "ignore",
});

/** A TypeScript type derived from {@link objectCellSchema}. */
export type ObjectCellLike = typeof objectCellSchema.infer;

/**
 * Refine {@link objectCellSchema} to a cell of a specific object type, comparing
 * its stored `obType` structurally against `expected`. A cell of another object
 * type — including one from another theory, whose `obType` differs — fails this
 * narrow, which is what rejects a wrong-typed endpoint at runtime.
 */
const endpointOfType = (expected: ObType) =>
    objectCellSchema.narrow((cell, ctx) => {
        if (sameTypeValue((cell as { type: { obType?: unknown } }).type.obType, expected)) {
            return true;
        }
        return ctx.reject({
            expected: `an object cell of type ${JSON.stringify(expected)}`,
            actual: JSON.stringify((cell as { type: { obType?: unknown } }).type.obType),
            path: ["type", "obType"],
        });
    });

/**
 * The schema for one morphism endpoint (`from`/`to`), shaped by the endpoint's
 * declared metadata:
 *
 * - a list endpoint (one with a `modality`) requires an *array* of object cells,
 *   so a single cell is rejected (and vice versa);
 * - the element/cell object type is checked against the declared `obType` when
 *   one is recorded; an endpoint with no declared `obType` accepts any object
 *   cell.
 */
const endpointSchema = (meta: MorEndpointMeta | undefined) => {
    const cell = meta?.obType ? endpointOfType(meta.obType) : objectCellSchema;
    const endpoint = meta?.modality !== undefined ? cell.array() : cell;
    return endpoint.or("null");
};

/**
 * Build and run the validator for a {@link Notebook.add} call, throwing a
 * {@link ValidationError} on failure. Object cells require a `name`; morphism
 * cells require a `name` and `from`/`to` endpoints, each of which may be `null`
 * to record an unset name or endpoint.
 */
export function validateAddArgs(def: ObjectDef | MorphismDef, args: unknown): void {
    const schema =
        def.tag === "object"
            ? type({ name: "string", "+": "ignore" })
            : type({
                  name: "string | null",
                  from: endpointSchema(def.domain),
                  to: endpointSchema(def.codomain),
                  "+": "ignore",
              });

    const result = schema(args);
    if (result instanceof type.errors) {
        throw new ValidationError(
            result.map((issue) => ({ message: issue.message, path: [...issue.path] })),
        );
    }
}
