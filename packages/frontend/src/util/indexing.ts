import invariant from "tiny-invariant";

import type { Uuid } from "catlog-wasm";

/** A map together with an index for efficient reverse lookup.
 */
export type IndexedMap<K, V> = {
    map: Map<K, V>;
    index: Map<V, Array<K>>;
};

/** Create an indexed map from an ordinary map.
 */
export function indexMap<K, V>(map: Map<K, V>) {
    const index = new Map<V, Array<K>>();
    for (const [k, v] of map.entries()) {
        const keys = index.get(v);
        if (keys === undefined) {
            index.set(v, [k]);
        } else {
            keys.push(k);
        }
    }
    return { map, index };
}

/** Index an arrow by a key, not necessarily unique.
 */
export function indexArray<K, V>(array: Array<V>, by: (x: V) => K) {
    const index = new Map<K, Array<V>>();
    for (const x of array) {
        const key = by(x);
        const vals = index.get(key);
        if (vals === undefined) {
            index.set(key, [x]);
        } else {
            vals.push(x);
        }
    }
    return index;
}

/** Index an array by a unique key.
 */
export function uniqueIndexArray<K, V>(array: Array<V>, by: (x: V) => K) {
    const index = new Map<K, V>();
    for (const x of array) {
        const key = by(x);
        invariant(!index.has(key), () => `Key ${key} is not unique`);
        index.set(key, x);
    }
    return index;
}

/** A bidirectional mapping between UUIDs and names.
 */
export type IdToNameMap = IndexedMap<Uuid, Name>;

/** A user-visible name in CatColab.

A name is either a string, a meaningful name typically created by a human, or a
number, a "`gensym`-ed" identifier that represents an anonymous entity.
 */
export type Name = string | number;

/** The two types of names. */
export type NameType = "named" | "anonymous";

export function nameType(name: Name): NameType {
    if (typeof name === "string") {
        return "named";
    }
    if (typeof name === "number") {
        return "anonymous";
    }
    throw new Error(`Name has invalid type: ${typeof name}`);
}
