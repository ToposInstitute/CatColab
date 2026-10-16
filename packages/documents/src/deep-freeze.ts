/** A plain, immutable value. No framework proxies cross the storage boundary. */
export type DeepReadonly<T> = T extends object
    ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
    : T;

/** Recursively freeze a value in place and return it as deeply readonly. */
export function deepFreeze<T>(value: T): DeepReadonly<T> {
    if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
        for (const child of Object.values(value as Record<string, unknown>)) {
            deepFreeze(child);
        }
        Object.freeze(value);
    }
    return value as DeepReadonly<T>;
}
