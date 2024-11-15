import { uuidv7 } from "uuidv7";

import { DblModelDiagram } from "catlog-wasm";
import type {
    DblTheory,
    DiagramMorDecl,
    DiagramObDecl,
    Mor,
    MorType,
    Ob,
    ObType,
} from "catlog-wasm";

/** A judgment in the definition of a diagram in a model.

Our diagrams are assumed to be free, i.e., we do not allow equations. This means
that judgments and declarations coincide for diagrams.
 */
export type DiagramJudgment = DiagramDecl;

/** A declaration in the definition of a diagram in a model.
 */
export type DiagramDecl = DiagramObjectDecl | DiagramMorphismDecl;

/** Declaration of an object in a diagram in a model.
 */
export type DiagramObjectDecl = DiagramObDecl & {
    tag: "object";

    /** Human-readable name of object. */
    name: string;
};

export const newDiagramObjectDecl = (obType: ObType, over?: Ob): DiagramObjectDecl => ({
    tag: "object",
    id: uuidv7(),
    name: "",
    obType,
    over: over ?? null,
});

/** Declaration of a morphism in a diagram in a model.
 */
export type DiagramMorphismDecl = DiagramMorDecl & {
    tag: "morphism";

    /** Human-readable name of object. */
    name: string;
};

export const newDiagramMorphismDecl = (morType: MorType, over?: Mor): DiagramMorphismDecl => ({
    tag: "morphism",
    id: uuidv7(),
    name: "",
    morType,
    over: over ?? null,
    dom: null,
    cod: null,
});

/** Construct a `catlog` diagram in a model from a sequence of judgments. */
export function catlogDiagram(theory: DblTheory, judgments: Array<DiagramJudgment>) {
    const diagram = new DblModelDiagram(theory);
    for (const judgment of judgments) {
        if (judgment.tag === "object") {
            diagram.addOb(judgment);
        } else if (judgment.tag === "morphism") {
            diagram.addMor(judgment);
        }
    }
    return diagram;
}
