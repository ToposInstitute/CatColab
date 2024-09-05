/** Make a deep copy of a JSON object.

The new-ish function `structuredClone` in the HTML DOM API seems not to work
with the proxy objects used by Solid, so we resort to the classic
stringify-then-parse method. Perhaps eventually we'll have a better method.
 */
export function deepCopyJSON(value: unknown) {
    return JSON.parse(JSON.stringify(value));
}
