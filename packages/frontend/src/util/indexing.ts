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
        console.assert(!index.has(key));
        index.set(key, x);
    }
    return index;
}
