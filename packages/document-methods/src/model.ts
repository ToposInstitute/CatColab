import { v7 } from "uuid";

import type { Document, Link, ModelJudgment, MorType, Ob, ObType } from "catcolab-document-types";
import { currentVersion } from "catcolab-document-types";
import { newNotebook } from "./notebook";

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

/** Create a new equation declaration.

The starting object, if given, is stored on the equation's `lhs` as the
identity path at that object. This is a placeholder used by the equation cell
editor when only the starting object has been chosen by the user.
 */
export const newEquationDecl = (
    startingOb?: Ob | null,
): ModelJudgment & { tag: "equation" } => ({
    tag: "equation",
    id: v7(),
    name: "",
    lhs: startingOb
        ? {
              tag: "Composite",
              content: { tag: "Id", content: startingOb },
          }
        : null,
    rhs: null,
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
    ...structuredClone(jgmt),
    id: v7(),
});
