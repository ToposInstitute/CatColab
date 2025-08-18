import { v7 } from "uuid";

import type { ModelJudgment, MorType, ObType, MorDecl } from "catlog-wasm";
import { deepCopyJSON } from "../util/deepcopy";

/** Declaration of an object in a model. */
export type ObjectDecl = ModelJudgment & {
    tag: "object";
};

/** Create a new object declaration with the given object type. */
export const newObjectDecl = (obType: ObType): ObjectDecl => ({
    tag: "object",
    id: v7(),
    name: "",
    obType,
});

/** Declaration of a morphim in a model. */
export type MorphismDecl = ModelJudgment & {
    tag: "morphism";
};

/** Create a new morphism declaration with the given morphism type. */
export const newMorphismDecl = (morType: MorType): MorphismDecl => ({
    tag: "morphism",
    id: v7(),
    name: "",
    morType,
    dom: null,
    cod: null,
});

/** Duplicate a model judgment, creating a fresh UUID when applicable. */
export const duplicateModelJudgment = (jgmt: ModelJudgment): ModelJudgment => ({
    ...deepCopyJSON(jgmt),
    id: v7(),
});

/** Return the name of a morphism if it exists, else a name of the form "src->tgt" */
export function morNameOrDefault(mor: MorDecl, objectNameMap: Map<string, string>): string {
    if (mor.name) {
        return mor.name;
    }

    const { dom, cod } = mor;
    if (dom?.tag !== "Basic" || cod?.tag !== "Basic") {
        return "";
    }

    const source = objectNameMap.get(dom.content);
    const target = objectNameMap.get(cod.content);
    if (source && target) {
        return `${source}→${target}`;
    }

    return "";
}
