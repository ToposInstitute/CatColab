import { v7 } from "uuid";

import type { DblModel, ModelJudgment, MorType, ObType, QualifiedName } from "catlog-wasm";
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

/** Return the label of a morphism if it exists, otherwise a label of the form "src->tgt" */
export function morLabelOrDefault(id: QualifiedName, model?: DblModel): string {
    const label = model?.morGeneratorLabel(id);
    if (label) {
        return label.join(".");
    }

    const [dom, cod] = [model?.getDom(id), model?.getCod(id)];
    if (dom?.tag !== "Basic" || cod?.tag !== "Basic") {
        return "";
    }

    const source = model?.obGeneratorLabel(dom.content);
    const target = model?.obGeneratorLabel(cod.content);
    if (source && target) {
        return `${source.join(".")}→${target.join(".")}`;
    }

    return "";
}
