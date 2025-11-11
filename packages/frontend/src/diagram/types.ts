import type { DiagramJudgment, Mor, MorType, Ob, ObType } from "catlog-wasm";
import { v7 } from "uuid";
import { deepCopyJSON } from "../util/deepcopy";

/** Create a new diagram object declaration with the given object type. */
export const newDiagramObjectDecl = (
    obType: ObType,
    over?: Ob,
): DiagramJudgment & { tag: "object" } => ({
    tag: "object",
    id: v7(),
    name: "",
    obType,
    over: over ?? null,
});

/** Create a new diagram morphism declaration with the given morphism type. */
export const newDiagramMorphismDecl = (
    morType: MorType,
    over?: Mor,
): DiagramJudgment & { tag: "morphism" } => ({
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
