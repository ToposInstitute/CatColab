import { v7 } from "uuid";

import type { ModelJudgment, MorType, ObType } from "catlaborator";
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

/** Declaration of a morphim in a model. */
export type MorphismDeclNext = ModelJudgment & {
    tag: "morphism-next";
};

/** Create a new morphism declaration with the given morphism type. */
export const newMorphismDeclNext = (morType: MorType): MorphismDeclNext => ({
    tag: "morphism-next",
    id: v7(),
    name: "",
    morType,
    dom: "",
    cod: "",
});

/** Declaration of a morphim in a model. */
export type InstanceDecl = ModelJudgment & {
    tag: "instance";
};

export const newNotebookDecl = (): InstanceDecl => ({
    tag: "instance",
    name: "",
    id: v7(),
    notebook_id: "",
});

/** Duplicate a model judgment, creating a fresh UUID when applicable. */
export const duplicateModelJudgment = (jgmt: ModelJudgment): ModelJudgment => ({
    ...deepCopyJSON(jgmt),
    id: v7(),
});
