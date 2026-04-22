import { v7 } from "uuid";

import { deepCopyJSON } from "./deepcopy";
import { newNotebook } from "./notebook";
import type { Document, Link, ModelJudgment, MorType, ObType } from "catcolab-document-types";
import { currentVersion } from "catcolab-document-types";

/** A document defining a model. */
export type ModelDocument = Document & { type: "model" };

/** Create an empty model document. */
export const newModelDocument = (args: {
    theory: string;
    editorVariant?: string;
}): ModelDocument => ({
    name: "",
    type: "model",
    theory: args.theory,
    ...(args.editorVariant ? { editorVariant: args.editorVariant } : {}),
    notebook: newNotebook<ModelJudgment>(),
    version: currentVersion(),
});

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
