import type { Mor } from "catcolab-document-types";
import { isRecord } from "../parsed-document";
import type { MorphismTypesOf, ObjectTypesOf, Shape } from "../shape";
import { obFromObjectCell, type MorphismCell, type ObjectCell } from "./cell";
import { tryGetModelJudgment, type ModelDocument } from "./document";
import type { EquationSide } from "./equation";

/** Converts an equation side into its stored form, dropping null morphisms. */
export function morFromSide<S extends Shape>(
    document: Readonly<ModelDocument>,
    side: EquationSide<S>,
): Mor | null {
    if ("kind" in side) {
        const ob = obFromObjectCell(document, side)!;
        return { tag: "Composite", content: { tag: "Id", content: ob } };
    }
    const mors: Mor[] = [];
    for (const cell of side) {
        if (cell !== null) {
            mors.push(morFromMorphismCell(document, cell));
        }
    }
    const [first, ...rest] = mors;
    if (first === undefined) {
        return null;
    }
    if (rest.length === 0) {
        return first;
    }
    return { tag: "Composite", content: { tag: "Seq", content: [first, ...rest] } };
}

/** Decode a stored side using caller-owned reference resolution (snapshot or frontend view). */
export function decodeEquationSide<S extends Shape>(
    side: unknown,
    objectFromOb: (ob: unknown) => ObjectCell<ObjectTypesOf<S>> | null,
    morphismFromId: (id: string) => MorphismCell<S, MorphismTypesOf<S>> | null,
): EquationSide<S> {
    if (side == null) {
        return [];
    }
    if (!isRecord(side)) {
        return [null];
    }
    if (
        side["tag"] === "Composite" &&
        isRecord(side["content"]) &&
        side["content"]["tag"] === "Id"
    ) {
        const object = objectFromOb(side["content"]["content"]);
        if (object === null) {
            return [null];
        }
        return object;
    }
    let mors: readonly unknown[];
    if (
        side["tag"] === "Composite" &&
        isRecord(side["content"]) &&
        side["content"]["tag"] === "Seq"
    ) {
        if (!Array.isArray(side["content"]["content"])) {
            return [null];
        }
        mors = side["content"]["content"];
    } else {
        mors = [side];
    }
    return mors.map((mor) => {
        if (!isRecord(mor) || mor["tag"] !== "Basic" || typeof mor["content"] !== "string") {
            return null;
        }
        return morphismFromId(mor["content"]);
    });
}

function morFromMorphismCell(document: Readonly<ModelDocument>, endpoint: MorphismCell): Mor {
    const judgment = tryGetModelJudgment(document, endpoint.id);
    if (!judgment) {
        throw new Error(`Cell ${endpoint.id} does not exist.`);
    }
    if (judgment.tag !== "morphism") {
        throw new Error(`Cell ${endpoint.id} is not a morphism.`);
    }
    return { tag: "Basic", content: judgment.id };
}
