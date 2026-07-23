import type { MorType, ObType } from "catcolab-document-types";
import { assertExhaustive } from "./util/assert_exhaustive";

export function objectTypesEqual(left: ObType, right: ObType): boolean {
    switch (left.tag) {
        case "Basic":
            return right.tag === "Basic" && left.content === right.content;
        case "Tabulator":
            return right.tag === "Tabulator" && morphismTypesEqual(left.content, right.content);
        case "ModeApp":
            return (
                right.tag === "ModeApp" &&
                left.content.modality === right.content.modality &&
                objectTypesEqual(left.content.obType, right.content.obType)
            );
        default:
            return assertExhaustive(left);
    }
}

export function morphismTypesEqual(left: MorType, right: MorType): boolean {
    switch (left.tag) {
        case "Basic":
            return right.tag === "Basic" && left.content === right.content;
        case "Hom":
            return right.tag === "Hom" && objectTypesEqual(left.content, right.content);
        case "Composite":
            return (
                right.tag === "Composite" &&
                left.content.length === right.content.length &&
                left.content.every((type, index) => morphismTypesEqual(type, right.content[index]!))
            );
        case "ModeApp":
            return (
                right.tag === "ModeApp" &&
                left.content.modality === right.content.modality &&
                morphismTypesEqual(left.content.morType, right.content.morType)
            );
        default:
            return assertExhaustive(left);
    }
}
