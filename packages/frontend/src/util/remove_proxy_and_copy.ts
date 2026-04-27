import { unwrap } from "solid-js/store";

/** Make a deep copy of a value, including Solid store proxies.

`structuredClone` does not work directly on Solid store proxies, so we first
unwrap the proxy and then clone. Safe to call on values that are not proxies.
 */
export function removeProxyAndCopy<T>(value: T): T {
    return structuredClone(unwrap(value));
}
