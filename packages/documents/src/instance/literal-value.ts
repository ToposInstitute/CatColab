import type { FieldValue } from "catcolab-document-types";
import type { Result } from "../result";
import { assertExhaustive } from "../util/assert_exhaustive";
import type { DeepReadonly } from "../util/deep-readonly";
import type { LiteralType } from "./tables";

type ParsedLiteral = {
    [T in LiteralType]: {
        type: T;
        value: T extends "Bool" ? boolean : T extends "String" ? string : number;
    };
}[LiteralType];

type StoredLiteral = Exclude<FieldValue, "Null" | { RowRef: string }>;

type LiteralInterpretation = Result<StoredLiteral, "missing" | "nonliteral" | "invalid">;

export function isLiteralValue(type: LiteralType, value: unknown): boolean {
    switch (type) {
        case "String":
            return typeof value === "string";
        case "Bool":
            return typeof value === "boolean";
        case "Int":
            return typeof value === "number" && Number.isInteger(value);
        case "Float":
            return typeof value === "number" && Number.isFinite(value);
        default:
            return assertExhaustive(type);
    }
}

export function parseLiteralValue(type: LiteralType, text: string): Result<ParsedLiteral> {
    const trimmed = text.trim();
    switch (type) {
        case "String":
            return { tag: "Ok", content: { type, value: text } };
        case "Bool":
            return trimmed === "true" || trimmed === "false"
                ? { tag: "Ok", content: { type, value: trimmed === "true" } }
                : { tag: "Err", content: [{ message: "Expected a Bool literal" }] };
        case "Int":
        case "Float": {
            const value = Number(trimmed);
            const valid = isLiteralValue(type, value);
            return trimmed !== "" && valid
                ? { tag: "Ok", content: { type, value } }
                : { tag: "Err", content: [{ message: `Invalid ${type} literal` }] };
        }
        default:
            return assertExhaustive(type);
    }
}

export function interpretLiteralValue(
    type: LiteralType,
    stored: DeepReadonly<FieldValue>,
): LiteralInterpretation {
    if (stored === "Null") {
        return { tag: "Err", content: "missing" };
    }
    if ("RowRef" in stored) {
        return { tag: "Err", content: "nonliteral" };
    }
    let text: string;
    if ("String" in stored && isLiteralValue("String", stored.String)) {
        text = stored.String;
    } else if ("Bool" in stored && isLiteralValue("Bool", stored.Bool)) {
        text = String(stored.Bool);
    } else if ("Int" in stored && isLiteralValue("Float", stored.Int)) {
        text = String(stored.Int);
    } else if ("Float" in stored && isLiteralValue("Float", stored.Float)) {
        text = String(stored.Float);
    } else {
        return { tag: "Err", content: "invalid" };
    }
    const parsed = parseLiteralValue(type, text);
    if (parsed.tag === "Err") {
        return { tag: "Err", content: "invalid" };
    }
    const literal = parsed.content;
    switch (literal.type) {
        case "String":
            return { tag: "Ok", content: { String: literal.value } };
        case "Bool":
            return { tag: "Ok", content: { Bool: literal.value } };
        case "Int":
            return { tag: "Ok", content: { Int: literal.value } };
        case "Float":
            return { tag: "Ok", content: { Float: literal.value } };
        default:
            return assertExhaustive(literal);
    }
}
