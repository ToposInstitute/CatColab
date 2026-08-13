import { Attr, AttrType, Entity, Mapping } from "catcolab-logics/simple-schema";

import type { DemoDocument } from "./document";

/**
 * The demo has a single {@link ScriptSidebar}; this module supplies its
 * particulars: the named values exposed to the script body, a starter script,
 * and the localStorage key under which the source is persisted.
 */
export type ScriptConfig = {
    scope: Record<string, unknown>;
    defaultScript: string;
    storageKey: string;
};

/**
 * The unified script config. A single pane edits *both* sides, so its scope
 * merges everything either side used to offer: the schema notebook, the
 * instance, the demo document, the fixed `attrTypes`, and the simple-schema
 * generator defs. One script can therefore build a schema and then populate an
 * instance of it in the same run, calling the same document API the notebook UI
 * and the tables use, so every mutation flows through the document's change
 * notification and updates the UI, history, and persistence exactly as
 * point-and-click edits do.
 */
export function demoScript(doc: DemoDocument): ScriptConfig {
    return {
        storageKey: "catcolab-instances-demo:script",
        defaultScript: `// Edit the schema and instance with JavaScript.
// Available: schema, instance, doc, attrTypes,
//            Entity, Mapping, Attr, AttrType.
//
//   schema.add(Entity, { label })            — add an entity
//   schema.add(Attr, { label, from, to })    — add an attribute
//   schema.add(Mapping, { label, from, to }) — add a mapping
//   schema.cellsOf(Entity | Attr | Mapping) — the schema cells
//   instance.add(entity, {})                — add a row (alias: addRow)
//   instance.rowsOf(entity) / instance.rows()
//   await instance.tables()                 — the instance's tables
//   table.addRow({...}) / table.rows / table.columns
//   row.set(morphism, value)                — set a mapping/attribute
//   row.get(morphism) / row.cells / row.index
//
// Example: build a tiny schema, then an instance of it.
const person = schema.add(Entity, { label: "Person" });
const name = schema.add(Attr, { label: "name", from: person, to: attrTypes.String });
const fred = instance.add(person, {name: "Fred"});
`,
        scope: {
            schema: doc.schema,
            instance: doc.instance,
            doc,
            attrTypes: doc.attrTypes,
            Entity,
            Mapping,
            Attr,
            AttrType,
        },
    };
}

/** The outcome of running a script: its return value, or the error it threw. */
export type RunResult = { tag: "ok"; value: unknown } | { tag: "error"; error: unknown };

/**
 * Run a script body against a scope. The body is wrapped in an async function
 * (so it may `await`) with the scope's named values passed in as parameters
 * rather than leaking globals. Because the script calls the same document API
 * the rest of the demo uses, every mutation flows through the document's change
 * notification, so the UI, history, and persistence all update as with
 * point-and-click edits. This is a demo affordance, not a sandbox: the script
 * has full access to the page.
 */
export async function runScript(
    scope: Record<string, unknown>,
    source: string,
): Promise<RunResult> {
    const names = Object.keys(scope);
    const values = Object.values(scope);
    try {
        const AsyncFunction = async function () {}.constructor as new (
            ...args: string[]
        ) => (...args: unknown[]) => Promise<unknown>;
        const fn = new AsyncFunction(...names, source);
        const value = await fn(...values);
        return { tag: "ok", value };
    } catch (error) {
        return { tag: "error", error };
    }
}

/** A compact string for a script's return value, shown in status lines. */
export function formatRunValue(value: unknown): string {
    if (typeof value === "string") {
        return value;
    }
    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
}
