import { v7 } from "uuid";

import type { DblModelDiagram } from "catlog-wasm";
import type { DiagramJudgment, Mor, MorType, Ob, ObType, Uuid } from "catlog-wasm";
import { deepCopyJSON } from "../util/deepcopy";
import type { Name } from "../util/indexing";

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

/** Extract a sequence of judgments from a diagram in `catlog`. */
export function fromCatlogDiagram(
    diagram: DblModelDiagram,
    obIdToName?: (id: Uuid) => Name | undefined,
): Array<DiagramJudgment> {
    // TODO: We should round-trip the names instead of having to reconstruct them here.
    const nameToString = (name?: Name) => (typeof name === "string" ? name : "");

    const obDecls: DiagramObjectDecl[] = diagram.objectDeclarations().map((decl) => ({
        tag: "object",
        ...decl,
        name: nameToString(obIdToName?.(decl.id)),
    }));

    const morDecls: DiagramMorphismDecl[] = diagram.morphismDeclarations().map((decl) => ({
        tag: "morphism",
        ...decl,
        name: "", // Morphisms are currently unnamed in frontend.
    }));

    return [...obDecls, ...morDecls];
}
