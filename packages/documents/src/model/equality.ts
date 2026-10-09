import type { MorType, ObType } from "catcolab-document-types";
import type { DeepReadonly } from "../document-store";
import { isRecord } from "../parsed-document";

/** Match a known type against an unchecked stored payload, not a schema validator. */
export function objectTypesEqual(left: DeepReadonly<ObType>, right: unknown): boolean {
    if (!isRecord(right)) {
        return false;
    }
    switch (left.tag) {
        case "Basic":
            return right["tag"] === "Basic" && left.content === right["content"];
        case "Tabulator":
            return (
                right["tag"] === "Tabulator" && morphismTypesEqual(left.content, right["content"])
            );
        case "ModeApp":
            return (
                right["tag"] === "ModeApp" &&
                isRecord(right["content"]) &&
                left.content.modality === right["content"]["modality"] &&
                objectTypesEqual(left.content.obType, right["content"]["obType"])
            );
        default:
            return false;
    }
}

export function morphismTypesEqual(left: DeepReadonly<MorType>, right: unknown): boolean {
    if (!isRecord(right)) {
        return false;
    }
    switch (left.tag) {
        case "Basic":
            return right["tag"] === "Basic" && left.content === right["content"];
        case "Hom":
            return right["tag"] === "Hom" && objectTypesEqual(left.content, right["content"]);
        case "Composite": {
            const contents = right["content"];
            return (
                right["tag"] === "Composite" &&
                Array.isArray(contents) &&
                left.content.length === contents.length &&
                left.content.every((type, index) => morphismTypesEqual(type, contents[index]))
            );
        }
        case "ModeApp":
            return (
                right["tag"] === "ModeApp" &&
                isRecord(right["content"]) &&
                left.content.modality === right["content"]["modality"] &&
                morphismTypesEqual(left.content.morType, right["content"]["morType"])
            );
        default:
            return false;
    }
}
