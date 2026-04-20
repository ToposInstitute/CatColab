import { deepEqual } from "fast-equals";

import type { Modality, Ob, ObOp } from "catlog-wasm";

/** Unwrap `App(op, ob)` to get the inner `ob`, if the op matches. */
export function unwrapApp(ob: Ob | null, applyOp: ObOp): Ob | null {
    if (!ob) {
        return ob;
    }
    if (ob.tag === "App" && deepEqual(ob.content.op, applyOp)) {
        return ob.content.ob;
    }
    return null;
}

/** Wrap an `ob` with `App(op, ob)`. */
export function wrapApp(ob: Ob | null, applyOp: ObOp): Ob | null {
    if (!ob) {
        return ob;
    }
    return { tag: "App", content: { op: applyOp, ob } };
}

/** Extract the list of objects from a `List` Ob. Returns `[]` if not a List or null. */
export function extractObList(ob: Ob | null): Array<Ob | null> {
    if (ob?.tag === "List") {
        return ob.content.objects;
    }
    return [];
}

/** Construct a `List` Ob from a modality and objects. */
export function buildObList(modality: Modality, objects: Array<Ob | null>): Ob {
    return { tag: "List", content: { modality, objects } };
}
