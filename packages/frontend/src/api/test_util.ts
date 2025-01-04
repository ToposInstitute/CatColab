import { assert } from "vitest";

import type { RpcResult } from "catcolab-api";

/** Unwrap the `Ok` variant of a RPC result. */
export function unwrap<T>(result: RpcResult<T>): T {
    assert.strictEqual(result.tag, "Ok");
    return (result as RpcResult<T> & { tag: "Ok" }).content;
}

/** Unwrap the `Err` variant of a RPC result. */
export function unwrapErr<T>(result: RpcResult<T>): { code: number; message: string } {
    assert.strictEqual(result.tag, "Err");
    return result as RpcResult<T> & { tag: "Err" };
}
