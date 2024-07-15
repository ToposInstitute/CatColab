/** A map together with an index for efficient reverse lookup.
 */
export type IndexedMap<K,V> = {
    map: Map<K,V>,
    index: Map<V,Array<K>>,
}

/** Create an indexed map from a plain map.
 */
export function indexMap<K,V>(map: Map<K,V>) {
    const index = new Map<V,Array<K>>();
    for (const [k,v] of map.entries()) {
        const keys = index.get(v);
        if (keys === undefined) {
            index.set(v, [k]);
        } else {
            keys.push(k);
        }
    }
    return {map, index};
}

/** Index an array by a unique key.
 */
export function uniqueIndexArray<K,V>(arr: Array<V>, by: (x: V) => K) {
    const index = new Map<K,V>();
    for (const x of arr) {
        const key = by(x);
        console.assert(!index.has(key));
        index.set(key, x);
    }
    return index;
}
