import { assert, describe, test } from "vitest";

import { MAX_CONTEXT_EXEC_RESULT_BYTES, contextExec } from "./context_exec";

describe("contextExec", () => {
    test("returns the stringified value of a return statement", async () => {
        const result = await contextExec("return 1 + 2", {});
        assert.deepStrictEqual(result, { tag: "Ok", value: "3" });
    });

    test("captures runtime and syntax errors", async () => {
        const runtimeError = await contextExec("throw new Error('boom')", {});
        assert.strictEqual(runtimeError.tag, "Err");
        if (runtimeError.tag === "Err") {
            assert.match(runtimeError.error, /boom/);
        }

        const syntaxError = await contextExec("return (", {});
        assert.strictEqual(syntaxError.tag, "Err");
    });

    test("always returns a string for successful execution", async () => {
        const result = await contextExec("return undefined", {});
        assert.deepStrictEqual(result, { tag: "Ok", value: "undefined" });
    });

    test("truncates oversized results with an indication", async () => {
        const result = await contextExec(
            `return "x".repeat(${MAX_CONTEXT_EXEC_RESULT_BYTES + 1})`,
            {},
        );
        assert.strictEqual(result.tag, "Ok");
        if (result.tag === "Ok") {
            assert.isAtMost(
                new TextEncoder().encode(result.value).length,
                MAX_CONTEXT_EXEC_RESULT_BYTES,
            );
            assert.match(result.value, /Output truncated: 4097 UTF-8 bytes total/);
        }
    });
});
