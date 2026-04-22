import { v7 } from "uuid";

import { deepCopyJSON } from "./deepcopy";
import { newNotebook } from "./notebook";
import type {
    Document,
    DiagramJudgment,
    Mor,
    MorType,
    Ob,
    ObType,
    StableRef,
} from "catcolab-document-types";
import { currentVersion } from "catcolab-document-types";

/** A document defining a diagram in a model. */
export type DiagramDocument = Document & { type: "diagram" };

/** Create an empty diagram of a model. */
export const newDiagramDocument = (modelRef: StableRef): DiagramDocument => ({
    name: "",
    type: "diagram",
    diagramIn: {
        ...modelRef,
        type: "diagram-in",
    },
    notebook: newNotebook<DiagramJudgment>(),
    version: currentVersion(),
});

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
