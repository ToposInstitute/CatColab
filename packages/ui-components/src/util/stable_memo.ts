import { type Accessor, createComputed, createSignal } from "solid-js";

/** A memo whose observers are not visited at all when its value is unchanged.

When a source of a `createMemo` changes, Solid marks every computation
transitively downstream of the memo as pending and revisits each of them,
even if the memo turns out to produce an equal value. Writing the value into
a signal instead cuts the graph there: downstream computations are only
notified when `equals` fails. Use this for a value with many observers that
usually stays the same when its sources change.
 */
export function createStableMemo<T>(
    fn: () => T,
    equals: (prev: T, next: T) => boolean = (a, b) => a === b,
): Accessor<T> {
    let initialized = false;
    const [value, setValue] = createSignal<T>(undefined as T, {
        equals: (prev, next) => initialized && equals(prev, next),
    });
    createComputed(() => {
        const next = fn();
        setValue(() => next);
        initialized = true;
    });
    return value;
}

/** Whether two maps have the same keys with identical values. */
export const mapsEqual = <K, V>(a: ReadonlyMap<K, V>, b: ReadonlyMap<K, V>): boolean => {
    if (a.size !== b.size) {
        return false;
    }
    for (const [key, value] of a) {
        if (!b.has(key) || b.get(key) !== value) {
            return false;
        }
    }
    return true;
};

/** Whether two arrays have identical elements in the same order. */
export const arraysEqual = <T>(a: ReadonlyArray<T>, b: ReadonlyArray<T>): boolean =>
    a.length === b.length && a.every((item, i) => item === b[i]);
