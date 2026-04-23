// FIXME: This shouldn't be here.
export function deepCopyJSON(value: unknown) {
    return JSON.parse(JSON.stringify(value));
}
