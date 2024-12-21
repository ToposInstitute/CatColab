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
    Uuid,
} from "catlog-wasm";
import { deepCopyJSON } from "../util/deepcopy";
import type { Name } from "../util/indexing";

/** A judgment in the definition of a diagram in a model.

Our diagrams are assumed to be free, i.e., we do not allow equations. This means
that judgments and declarations coincide for diagrams, in contrast to models.
 */
export type DiagramJudgment = DiagramDecl;

/** A declaration in the definition of a diagram in a model. */
export type DiagramDecl = DiagramObjectDecl | DiagramMorphismDecl;

/** Declaration of an object in a diagram in a model. */
export type DiagramObjectDecl = DiagramObDecl & {
    tag: "object";

    /** Human-readable name of object. */
    name: string;
};

/** Create a new diagram object declaration with the given object type. */
export const newDiagramObjectDecl = (obType: ObType, over?: Ob): DiagramObjectDecl => ({
    tag: "object",
    id: uuidv7(),
    name: "",
    obType,
    over: over ?? null,
});

/** Declaration of a morphism in a diagram in a model. */
export type DiagramMorphismDecl = DiagramMorDecl & {
    tag: "morphism";

    /** Human-readable name of object. */
    name: string;
};

/** Create a new diagram morphism declaration with the given morphism type. */
export const newDiagramMorphismDecl = (morType: MorType, over?: Mor): DiagramMorphismDecl => ({
    tag: "morphism",
    id: uuidv7(),
    name: "",
    morType,
    over: over ?? null,
    dom: null,
    cod: null,
});

/** Duplicate a diagram judgment, creating a fresh UUID. */
export const duplicateDiagramJudgment = (jgmt: DiagramJudgment): DiagramJudgment => ({
    ...deepCopyJSON(jgmt),
    id: uuidv7(),
});

/** Construct a diagram in `catlog` from a sequence of judgments. */
export function toCatlogDiagram(theory: DblTheory, judgments: Array<DiagramJudgment>) {
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

/** Extract a sequence of judgments from a diagram in `catlog`. */
export function fromCatlogDiagram(
    diagram: DblModelDiagram,
    obIdToName?: (id: Uuid) => Name | undefined,
): Array<DiagramJudgment> {
    const nameToString = (name?: Name) => (typeof name === "string" ? name : "");

    const obDecls: DiagramObjectDecl[] = diagram.objectDeclarations().map((decl) => ({
        tag: "object",
        name: nameToString(obIdToName?.(decl.id)),
        ...decl,
    }));

    const morDecls: DiagramMorphismDecl[] = diagram.morphismDeclarations().map((decl) => ({
        tag: "morphism",
        name: "", // Morphisms are currently unnamed in frontend.
        ...decl,
    }));

    return [...obDecls, ...morDecls];
}
