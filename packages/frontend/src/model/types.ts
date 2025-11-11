import type { DblModel, Link, ModelJudgment, MorType, ObType, QualifiedName } from "catlog-wasm";
import { v7 } from "uuid";
import { deepCopyJSON } from "../util/deepcopy";

/** Create a new object declaration with the given object type. */
export const newObjectDecl = (obType: ObType): ModelJudgment & { tag: "object" } => ({
    tag: "object",
    id: v7(),
    name: "",
    obType,
});

/** Create a new morphism declaration with the given morphism type. */
export const newMorphismDecl = (morType: MorType): ModelJudgment & { tag: "morphism" } => ({
    tag: "morphism",
    id: v7(),
    name: "",
    morType,
    dom: null,
    cod: null,
});

/** Create a new instantiation of an existing model. */
export const newInstantiatedModel = (
    model?: Link | null,
): ModelJudgment & { tag: "instantiation" } => ({
    tag: "instantiation",
    id: v7(),
    name: "",
    model: model ?? null,
    specializations: [],
});

/** Duplicate a model judgment, creating a fresh UUID when applicable. */
export const duplicateModelJudgment = (jgmt: ModelJudgment): ModelJudgment => ({
    ...deepCopyJSON(jgmt),
    id: v7(),
});

/** Get the label of a morphism if it exists, otherwise a label of the form "src->tgt" */
export function morLabelOrDefault(id: QualifiedName, model?: DblModel): string | undefined {
    if (!model) {
        return;
    }

    const label = model.morGeneratorLabel(id);
    if (label) {
        return label.join(".");
    }

    const mor = model.morPresentation(id);
    if (mor && mor.dom.tag === "Basic" && mor.cod.tag === "Basic") {
        const src = model.obGeneratorLabel(mor.dom.content);
        const tgt = model.obGeneratorLabel(mor.cod.content);
        if (src && tgt) {
            return `${src.join(".")}→${tgt.join(".")}`;
        }
    }
}
