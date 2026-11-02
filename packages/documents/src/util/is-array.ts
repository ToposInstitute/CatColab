/* A type-only wrapper around Array.isArray. Array.isArray strips "readonly"
 * from the type so we avoid that with this wrapper.
 * https://github.com/microsoft/TypeScript/issues/17002
 */
export function isArray(value: unknown): value is readonly unknown[] {
    return Array.isArray(value);
}
