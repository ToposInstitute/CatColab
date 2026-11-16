import { describe, expect, test } from "vitest";

import type { FieldValue } from "catcolab-document-types";
import { interpretLiteralValue } from "../src/instance/literal-value";
import type { LiteralType } from "../src/instance/tables";

describe("stored literal interpretation", () => {
    test.each<{
        stored: FieldValue;
        type: LiteralType;
        expected: FieldValue;
    }>([
        { stored: { String: " 15.6 " }, type: "Float", expected: { Float: 15.6 } },
        { stored: { String: "15" }, type: "Int", expected: { Int: 15 } },
        { stored: { Float: 15 }, type: "Int", expected: { Int: 15 } },
        { stored: { Int: 15.6 }, type: "Float", expected: { Float: 15.6 } },
        { stored: { String: " true " }, type: "Bool", expected: { Bool: true } },
        { stored: { String: "false" }, type: "Bool", expected: { Bool: false } },
        { stored: { Bool: true }, type: "String", expected: { String: "true" } },
        { stored: { Float: 15.6 }, type: "String", expected: { String: "15.6" } },
        { stored: { String: "  hello  " }, type: "String", expected: { String: "  hello  " } },
        { stored: { String: "" }, type: "String", expected: { String: "" } },
    ])("interprets $stored as $type", ({ stored, type, expected }) => {
        expect(interpretLiteralValue(type, stored)).toEqual({ tag: "Ok", content: expected });
    });

    test.each<{
        stored: FieldValue;
        type: LiteralType;
    }>([
        { stored: { String: "15.6" }, type: "Int" },
        { stored: { Int: 15.6 }, type: "Int" },
        { stored: { String: " " }, type: "Float" },
        { stored: { String: "bad" }, type: "Float" },
        { stored: { Bool: true }, type: "Int" },
        { stored: { Int: 1 }, type: "Bool" },
    ])("rejects invalid $stored under $type", ({ stored, type }) => {
        expect(interpretLiteralValue(type, stored)).toEqual({ tag: "Err", content: "invalid" });
    });

    test("rejects missing, referenced, and malformed values", () => {
        expect(interpretLiteralValue("String", "Null")).toEqual({ tag: "Err", content: "missing" });
        expect(interpretLiteralValue("String", { RowRef: "15" })).toEqual({
            tag: "Err",
            content: "nonliteral",
        });
        for (const stored of [
            { Bool: "true" },
            { Int: "15" },
            { Float: Infinity },
            { Float: NaN },
        ]) {
            expect(interpretLiteralValue("String", stored as FieldValue)).toEqual({
                tag: "Err",
                content: "invalid",
            });
        }
    });
});
