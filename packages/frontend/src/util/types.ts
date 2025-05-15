/** Utility type that treats an `interface` like a `type`.

We need this because we'd prefer to work with types (which, unlike interfaces,
cannot be extended) but currently `tsify` generates interfaces instead (see
https://github.com/madonoharu/tsify/issues/61).

Borrowed from here: https://stackoverflow.com/a/78441681
 */
export type InterfaceToType<T> = {
    [K in keyof T]: InterfaceToType<T[K]>;
};
