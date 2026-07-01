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

/** A shape that looks like an object-cell handle: `kind` is
 * {@link CellKind.Object} and it carries a `type.obType`. */
type ObjectCellShape = { kind: unknown; type: { obType?: unknown } };

/** Test the structural shape of an object-cell handle without leaking ArkType's
 * internal per-field messages (e.g. the `kind` symbol). */
const looksLikeObjectCell = (value: unknown): value is ObjectCellShape =>
    typeof value === "object" &&
    value !== null &&
    (value as ObjectCellShape).kind === CellKind.Object &&
    typeof (value as ObjectCellShape).type === "object" &&
    (value as ObjectCellShape).type !== null;

/** Human-readable name of an object type, for legible messages: the `content`
 * of a `Basic` obType (e.g. `Entity`), else its JSON form. */
const obTypeName = (obType: unknown): string => {
    if (
        typeof obType === "object" &&
        obType !== null &&
        typeof (obType as { content?: unknown }).content === "string"
    ) {
        return (obType as { content: string }).content;
    }
    return JSON.stringify(obType);
};

/** Describe a runtime value for the `(was …)` half of a legible message,
 * without dumping a whole object-cell handle (functions, ids) as JSON. */
const describeValue = (value: unknown): string => {
    if (value === undefined) {
        return "missing";
    }
    if (value === null) {
        return "null";
    }
    if (Array.isArray(value)) {
        return "an array";
    }
    if (looksLikeObjectCell(value)) {
        return `an object cell of type ${obTypeName(value.type.obType)}`;
    }
    return typeof value;
};

/** Check that `value` is an object cell, optionally of `expected` type,
 * rejecting through `ctx` with a legible message otherwise. */
const checkObjectCell = (
    value: unknown,
    expected: ObType | undefined,
    ctx: { reject(spec: { expected: string; actual: string }): false },
): boolean => {
    if (!looksLikeObjectCell(value)) {
        return ctx.reject({ expected: "an object cell", actual: describeValue(value) });
    }
    if (expected && !sameTypeValue(value.type.obType, expected)) {
        return ctx.reject({
            expected: `an object cell of type ${obTypeName(expected)}`,
            actual: `an object cell of type ${obTypeName(value.type.obType)}`,
        });
    }
    return true;
};

/**
 * The schema for one morphism endpoint (`from`/`to`), shaped by the endpoint's
 * declared metadata. It is a single `narrow` over `unknown` — deliberately *not*
 * a `.or("null")`/`.array()` combination — so both halves of every failure
 * message stay under our control and legible (an ArkType union re-serializes the
 * rejected value, dumping a whole cell handle, functions and all):
 *
 * - `null` is always accepted (an unset endpoint);
 * - a list endpoint (one with a `modality`) requires an *array* of object cells,
 *   so a single cell is rejected (and vice versa);
 * - the element/cell object type is checked against the declared `obType` when
 *   one is recorded; an endpoint with no declared `obType` accepts any object
 *   cell — including one from another theory, whose `obType` differs, which is
 *   rejected when a type is declared.
 */
const endpointSchema = (meta: MorEndpointMeta | undefined) => {
    const expected = meta?.obType;
    const isList = meta?.modality !== undefined;
    const shape = isList ? "an array or null" : "an object cell or null";
    return type("unknown").narrow((value, ctx) => {
        if (value === null) {
            return true;
        }
        if (isList) {
            if (!Array.isArray(value)) {
                return ctx.reject({ expected: shape, actual: describeValue(value) });
            }
            return value.every((element) => checkObjectCell(element, expected, ctx));
        }
        if (Array.isArray(value)) {
            return ctx.reject({ expected: shape, actual: "an array" });
        }
        return checkObjectCell(value, expected, ctx);
    });
};

/**
 * Build and run the validator for a {@link Notebook.add} call, throwing a
 * {@link ValidationError} on failure. Object cells require a `name`; morphism
 * cells require a `name` and `from`/`to` endpoints, each of which may be `null`
 * to record an unset name or endpoint.
 */
export function validateAddArgs(def: ObjectDef | MorphismDef, args: unknown): void {
    if (def.tag === "object") {
        runSchema(type({ name: "string", "+": "ignore" }), args);
        return;
    }

    // Endpoint keys are *optional* in the schema so an absent one reaches our
    // own missing-field check below (which yields a legible "must be an object
    // cell or null (was missing)") rather than ArkType's bare "must be present".
    // A key that *is* present still runs the endpoint narrow.
    const schema = type({
        name: "string | null",
        "from?": endpointSchema(def.domain),
        "to?": endpointSchema(def.codomain),
        "+": "ignore",
    });

    const supplied =
        typeof args === "object" && args !== null ? (args as Record<string, unknown>) : {};
    const missing: Issue[] = [];
    for (const key of ["from", "to"] as const) {
        if (!(key in supplied)) {
            const meta = key === "from" ? def.domain : def.codomain;
            const shape = meta?.modality !== undefined ? "an array or null" : "an object cell or null";
            missing.push({ message: `\`${key}\` must be ${shape} (was missing)`, path: [key] });
        }
    }

    runSchema(schema, args, missing);
}

/**
 * Build and run the validator for a {@link Update.update} call, throwing a
 * {@link ValidationError} on failure. Unlike {@link validateAddArgs}, an update
 * is *partial*: only the fields actually present in `args` are checked, so an
 * omitted field is left untouched rather than rejected as missing. The same
 * per-field endpoint rules as `add` apply to any field that *is* supplied.
 */
export function validateUpdateArgs(def: ObjectDef | MorphismDef, args: unknown): void {
    const supplied =
        typeof args === "object" && args !== null ? (args as Record<string, unknown>) : {};

    const fields: Record<string, unknown> = {};
    if ("name" in supplied) {
        fields["name"] = def.tag === "object" ? "string" : "string | null";
    }
    if (def.tag === "morphism") {
        if ("from" in supplied) {
            fields["from"] = endpointSchema(def.domain);
        }
        if ("to" in supplied) {
            fields["to"] = endpointSchema(def.codomain);
        }
    }

    runSchema(type({ ...fields, "+": "ignore" }), args);
}

/** The leading path key of an issue, for stable message ordering. */
const issueKey = (issue: Issue): string => String(issue.path?.[0] ?? "");

/** Wrap the leading field name of an ArkType message in backticks. ArkType
 * prefixes each field message with its bare path key (e.g. `from must be …`);
 * delimiting that key keeps the field name legible and consistent with our
 * other messages (e.g. those from {@link Notebook.get}). */
const delimitFieldName = (message: string, path: readonly PropertyKey[]): string => {
    const key = path[0];
    if (typeof key !== "string") {
        return message;
    }
    const prefix = `${key} `;
    return message.startsWith(prefix) ? `\`${key}\` ${message.slice(prefix.length)}` : message;
};

/** Run an ArkType schema and, on failure (or if any `extra` issues were
 * supplied), throw a {@link ValidationError} carrying all issues as a Standard
 * Schema `FailureResult`. Issues are sorted by their leading path key so the
 * message order is stable regardless of input key order. */
function runSchema(
    schema: { (data: unknown): unknown },
    args: unknown,
    extra: readonly Issue[] = [],
): void {
    const result = schema(args);
    const fromSchema =
        result instanceof type.errors
            ? result.map((issue) => {
                  const path = [...issue.path];
                  return { message: delimitFieldName(issue.message, path), path };
              })
            : [];
    const issues = [...fromSchema, ...extra];
    if (issues.length > 0) {
        issues.sort((a, b) => issueKey(a).localeCompare(issueKey(b)));
        throw new ValidationError(issues);
    }
}
