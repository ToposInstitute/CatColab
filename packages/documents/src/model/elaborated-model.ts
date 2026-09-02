import type { Mor } from "catcolab-document-types";
import type { ModelPresentation, MorGenerator, QualifiedLabel } from "catlog-wasm";
import type { Issue } from "../result";
import {
    findMorphismType,
    findObjectType,
    type AnyCellType,
    type EquationType,
    type MorphismType,
    type MorphismTypesOf,
    type ObjectType,
    type ObjectTypesOf,
    type RichTextType,
    type Shape,
} from "../shape";
import { morphismTypesEqual, objectTypesEqual } from "./equality";

/** An object judgment of an elaborated model. Mirrors [`ObjectCell`], minus
mutation */
export interface ObjectJudgment<O extends ObjectType> {
    readonly kind: "object";
    readonly id: string;
    readonly type: O;
    readonly label: QualifiedLabel;
}

/** A morphism judgment of an elaborated model. Mirrors [`MorphismCell`], minus
mutation display string. */
export interface MorphismJudgment<
    out S extends Shape,
    M extends MorphismType = MorphismTypesOf<S>,
> {
    readonly kind: "morphism";
    readonly id: string;
    readonly type: M;
    readonly label: QualifiedLabel;
    readonly from: ObjectJudgment<ObjectTypesOf<S>> | null;
    readonly to: ObjectJudgment<ObjectTypesOf<S>> | null;
}

/** A judgment of an elaborated model.*/
/** One side of an elaborated equation: the identity on an object, or a
composite of morphism judgments. Morphisms that cannot be resolved are `null`. */
export type EquationJudgmentSide<S extends Shape> =
    | ObjectJudgment<ObjectTypesOf<S>>
    | {
          readonly kind: "composite";
          readonly morphisms: ReadonlyArray<MorphismJudgment<S> | null>;
      };

/** An equation judgment of an elaborated model. Mirrors [`EquationCell`], minus
mutation. */
export interface EquationJudgment<S extends Shape> {
    readonly kind: "path-equation";
    readonly id: string;
    readonly label: QualifiedLabel;
    readonly lhs: EquationJudgmentSide<S>;
    readonly rhs: EquationJudgmentSide<S>;
}

/** A judgment of an elaborated model.*/
export type JudgmentOf<S extends Shape> =
    | ObjectJudgment<ObjectTypesOf<S>>
    | MorphismJudgment<S, MorphismTypesOf<S>>
    | EquationJudgment<S>;

/** Read-only, shape-typed access to an elaborated model.

The API mirrors the notebook's `cells`/`cellsOf`: judgments are returned in
presentation order (objects first, then morphisms, then equations). */
export interface ElaboratedModel<out S extends Shape> {
    judgments(): ReadonlyArray<JudgmentOf<S>>;

    /** Judgments of the given cell type or shape, in presentation order.

    Filtering by a specific cell type narrows the result accordingly. */
    judgmentsOf(type: RichTextType): ReadonlyArray<never>;
    judgmentsOf(type: ObjectType): ReadonlyArray<ObjectJudgment<ObjectTypesOf<S>>>;
    judgmentsOf(type: MorphismType): ReadonlyArray<MorphismJudgment<S>>;
    judgmentsOf(type: EquationType): ReadonlyArray<EquationJudgment<S>>;
    judgmentsOf(typeOrShape: AnyCellType | Shape): ReadonlyArray<JudgmentOf<S>>;
}

/** The result of elaborating and validating a notebook.

Elaboration and validation are separate steps, so `model` is always available:
it contains the elaborated judgments even when validation fails. The model is
empty when elaboration fails or the core theory cannot be loaded. */
export interface ModelValidation<out S extends Shape> {
    readonly model: ElaboratedModel<S>;
    /** Validation issues; empty when the notebook is valid. */
    readonly issues: ReadonlyArray<Issue>;
}

/** A live view of a notebook's validation state.

While the view is active, the notebook revalidates whenever its document
changes; `model` and `issues` reflect the latest outcome. Before the first
elaboration completes, `model` is empty and `issues` reports that validation is
pending. The caller must dispose the view when it is no longer needed.

In the case of an empty model the `model.judgments` and `model.judgmentsOf`
methods return empty arrays. */
export interface ModelValidationView<out S extends Shape> extends ModelValidation<S> {
    dispose(): void;
}

/** Create an elaborated model over a (possibly changing) model presentation. */
export function elaboratedModelFromPresentation<S extends Shape>(
    shape: S,
    getPresentation: () => Readonly<ModelPresentation> | undefined,
): ElaboratedModel<S> {
    function judgments(): ReadonlyArray<JudgmentOf<S>> {
        const presentation = getPresentation();
        if (presentation === undefined) {
            return [];
        }

        const objectsById = new Map<string, ObjectJudgment<ObjectTypesOf<S>>>();
        const objects: ObjectJudgment<ObjectTypesOf<S>>[] = [];
        for (const generator of presentation.obGenerators) {
            const type = findObjectType(shape, generator.obType);
            if (type === undefined) {
                continue;
            }
            const judgment: ObjectJudgment<ObjectTypesOf<S>> = {
                kind: "object",
                id: generator.id,
                type,
                label: generator.label ?? [],
            };
            objectsById.set(generator.id, judgment);
            objects.push(judgment);
        }

        const morphismsById = new Map<string, MorphismJudgment<S>>();
        const morphisms: MorphismJudgment<S, MorphismTypesOf<S>>[] = [];
        for (const generator of presentation.morGenerators) {
            const type = findMorphismType(shape, generator.morType);
            if (type === undefined) {
                continue;
            }
            const judgment: MorphismJudgment<S> = {
                kind: "morphism",
                id: generator.id,
                type,
                label: generator.label ?? [],
                from: endpointJudgment(objectsById, generator.dom),
                to: endpointJudgment(objectsById, generator.cod),
            };
            morphismsById.set(generator.id, judgment);
            morphisms.push(judgment);
        }

        const equations: EquationJudgment<S>[] = [];
        for (const generator of presentation.equations) {
            equations.push({
                kind: "path-equation",
                id: generator.id,
                label: generator.label ?? [],
                lhs: judgmentSideFromMor(objectsById, morphismsById, generator.lhs),
                rhs: judgmentSideFromMor(objectsById, morphismsById, generator.rhs),
            });
        }

        return [...objects, ...morphisms, ...equations];
    }

    function judgmentsOf(typeOrShape: AnyCellType | Shape): ReadonlyArray<JudgmentOf<S>> {
        return judgments().filter((judgment) => judgmentMatchesFilter(judgment, typeOrShape));
    }

    return {
        judgments,
        // The filter above already narrows per cell type, which TypeScript
        // cannot see; the cast makes the overloads on `ElaboratedModel` honest.
        judgmentsOf: judgmentsOf as ElaboratedModel<S>["judgmentsOf"],
    };
}

function endpointJudgment<S extends Shape>(
    objectsById: ReadonlyMap<string, ObjectJudgment<ObjectTypesOf<S>>>,
    endpoint: MorGenerator["dom"],
): ObjectJudgment<ObjectTypesOf<S>> | null {
    if (endpoint.tag !== "Basic") {
        return null;
    }
    return objectsById.get(endpoint.content) ?? null;
}

function judgmentSideFromMor<S extends Shape>(
    objectsById: ReadonlyMap<string, ObjectJudgment<ObjectTypesOf<S>>>,
    morphismsById: ReadonlyMap<string, MorphismJudgment<S>>,
    side: Mor,
): EquationJudgmentSide<S> {
    if (side.tag === "Composite" && side.content.tag === "Id") {
        if (side.content.content.tag === "Basic") {
            const judgment = objectsById.get(side.content.content.content);
            if (judgment !== undefined) {
                return judgment;
            }
        }
        return { kind: "composite", morphisms: [null] };
    }
    let mors: Mor[];
    if (side.tag === "Composite" && side.content.tag === "Seq") {
        mors = side.content.content;
    } else {
        mors = [side];
    }
    return {
        kind: "composite",
        morphisms: mors.map((mor) => {
            if (mor.tag !== "Basic") {
                return null;
            }
            return morphismsById.get(mor.content) ?? null;
        }),
    };
}

function isCellType(value: AnyCellType | Shape): value is AnyCellType {
    return "kind" in value;
}

function judgmentMatchesFilter<S extends Shape>(
    judgment: JudgmentOf<S>,
    filter: AnyCellType | Shape,
): boolean {
    if (isCellType(filter)) {
        switch (filter.kind) {
            case "rich-text":
                return false;
            case "object":
                return (
                    judgment.kind === "object" &&
                    objectTypesEqual(judgment.type.obType, filter.obType)
                );
            case "morphism":
                return (
                    judgment.kind === "morphism" &&
                    morphismTypesEqual(judgment.type.morType, filter.morType)
                );
            case "path-equation":
                return judgment.kind === "path-equation";
        }
    }

    if (judgment.kind === "object") {
        return (filter.objects ?? []).some((type) =>
            objectTypesEqual(judgment.type.obType, type.obType),
        );
    }
    if (judgment.kind === "morphism") {
        return (filter.morphisms ?? []).some((type) =>
            morphismTypesEqual(judgment.type.morType, type.morType),
        );
    }
    return filter.supportsEquations === true;
}
