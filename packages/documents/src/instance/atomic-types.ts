import type { QualifiedLabel } from "catlog-wasm";
import type { LiteralType } from "./tables";

/** Decide which concrete atomic type an attribute type's qualified label
    denotes. The first label segment decides. This function is intended to be
    temporary and should be replaced once we have an account of typing with
    which we are satisfied. */
export function atomicTypeOfAttributeType(label: QualifiedLabel): LiteralType {
    const name = label[0];
    switch (name) {
        case "Bool":
        case "Int":
        case "Float":
        case "String":
            return name;
        default:
            return "String";
    }
}
