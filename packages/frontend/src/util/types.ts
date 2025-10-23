/** Utility type that treats an `interface` like a `type`.

We need this because we'd prefer to work with types (which, unlike interfaces,
cannot be extended) but currently `tsify` generates interfaces instead (see
https://github.com/madonoharu/tsify/issues/61).

Borrowed from: <https://stackoverflow.com/a/78441681>
 */
export type InterfaceToType<T> = {
    [K in keyof T]: InterfaceToType<T[K]>;
};

/** Assertion at the type-level.

Call this function as no effect. The minimal version of:

<https://github.com/garronej/tsafe/blob/main/src/assert.ts>
 */
export function assertTypelevel<_T extends true>() {}
