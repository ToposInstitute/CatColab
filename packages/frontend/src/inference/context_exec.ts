import type { EvalResult } from "catcolab-document-types";
import { errorMessage } from "../util/error";

export type { EvalResult } from "catcolab-document-types";

/** Local bindings available to code executed by `contextExec`. */
export type ContextExecScope = Readonly<Record<string, unknown>>;

/** Maximum UTF-8 byte length of a value returned to the LLM. */
export const MAX_CONTEXT_EXEC_RESULT_BYTES = 4 * 1024;

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const textEncoder = new TextEncoder();
const strictTextDecoder = new TextDecoder("utf-8", { fatal: true });

/** Execute JavaScript with the given local bindings.

The generated function does not close over the caller's lexical scope. As with
any function created using `Function`, JavaScript globals remain available; this
is not a sandbox.
 */
export async function contextExec(
    code: string,
    scope: ContextExecScope,
    onSuccessHook?: () => Promise<void>,
): Promise<EvalResult> {
    const bindings = Object.entries(scope);

    try {
        // oxlint-disable no-implied-eval -- Executing generated code is the purpose of this module.
        const fn = new AsyncFunction(
            ...bindings.map(([name]) => name),
            `"use strict";\n${code}`,
        ) as (...args: unknown[]) => Promise<unknown>;
        // oxlint-enable no-implied-eval

        const value = await fn(...bindings.map(([, value]) => value));
        await onSuccessHook?.();
        return { tag: "Ok", value: truncateResult(stringify(value)) };
    } catch (error) {
        return { tag: "Err", error: truncateResult(errorMessage(error)) };
    }
}

function stringify(value: unknown): string {
    if (typeof value === "string") {
        return value;
    }
    let serialized: string | undefined;
    try {
        serialized = JSON.stringify(value);
    } catch {
        // Fall back to String below.
    }
    return serialized ?? String(value);
}

function truncateResult(result: string): string {
    const bytes = textEncoder.encode(result);
    if (bytes.length <= MAX_CONTEXT_EXEC_RESULT_BYTES) {
        return result;
    }

    const suffix = `\n[Output truncated: ${bytes.length} UTF-8 bytes total; return a smaller value.]`;
    const prefixByteLength = MAX_CONTEXT_EXEC_RESULT_BYTES - textEncoder.encode(suffix).length;
    for (let end = prefixByteLength; end >= 0; end -= 1) {
        try {
            return `${strictTextDecoder.decode(bytes.subarray(0, end))}${suffix}`;
        } catch {
            // A UTF-8 character was split at the boundary; try a shorter prefix?
        }
    }

    return "<execution result truncation failed>";
}
