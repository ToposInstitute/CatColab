import { v7 } from "uuid";

import type {
    DiagramJudgment,
    Document,
    Link,
    Mor,
    MorType,
    Ob,
    ObType,
} from "catcolab-document-types";
import { currentVersion } from "catcolab-document-types";
import { newNotebook } from "../notebook";

/** A document defining a diagram in a model. */
export type DiagramDocument = Document & { type: "diagram" };

/** Create an empty diagram document referencing the model it is drawn in. */
export const newDiagramDocument = (args: { diagramIn: Link; name?: string }): DiagramDocument => ({
    type: "diagram",
    name: args.name ?? "",
    diagramIn: args.diagramIn,
    notebook: newNotebook<DiagramJudgment>(),
    version: currentVersion(),
});

/** Create a new diagram object declaration with the given object type. */
export const newDiagramObjectDecl = (
    obType: ObType,
    over?: Ob | null,
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
    over?: Mor | null,
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
    ...structuredClone(jgmt),
    id: v7(),
});
