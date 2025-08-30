import { v7 } from "uuid";

import type { DiagramJudgment, Mor, MorType, Ob, ObType } from "catlog-wasm";
import { deepCopyJSON } from "../util/deepcopy";

/** Declaration of an object in a diagram in a model. */
export type DiagramObjectDecl = DiagramJudgment & {
    tag: "object";
};

/** Create a new diagram object declaration with the given object type. */
export const newDiagramObjectDecl = (obType: ObType, over?: Ob): DiagramObjectDecl => ({
    tag: "object",
    id: v7(),
    name: "",
    obType,
    over: over ?? null,
});

/** Declaration of a morphism in a diagram in a model. */
export type DiagramMorphismDecl = DiagramJudgment & {
    tag: "morphism";
};

/** Create a new diagram morphism declaration with the given morphism type. */
export const newDiagramMorphismDecl = (morType: MorType, over?: Mor): DiagramMorphismDecl => ({
    tag: "morphism",
    id: v7(),
    name: "",
    morType,
    over: over ?? null,
    dom: null,
    cod: null,
});

/** Duplicate a diagram judgment, creating a fresh UUID. */
export const duplicateDiagramJudgment = (jgmt: DiagramJudgment): DiagramJudgment => ({
    ...deepCopyJSON(jgmt),
    id: v7(),
});
