import type { ModelPresentation, MorGenerator, ObGenerator } from "catlog-wasm";
import {
    findMorphismType,
    findObjectType,
    type AnyCellType,
    type MorphismType,
    type MorphismTypesOf,
    type ObjectType,
    type ObjectTypesOf,
    type Shape,
} from "../shape";
import { morphismTypesEqual, objectTypesEqual } from "./equality";

/** An object judgment of an elaborated model. Mirrors [`ObjectCell`], minus mutation. */
export interface ObjectJudgment<O extends ObjectType> {
    readonly kind: "object";
    readonly id: string;
    readonly type: O;
    readonly label: string;
}

/** A morphism judgment of an elaborated model. Mirrors [`MorphismCell`], minus mutation.

The endpoints are resolved to object judgments; an endpoint that is not a basic
object generator is `null`. */
export interface MorphismJudgment<
    out S extends Shape,
    M extends MorphismType = MorphismTypesOf<S>,
> {
    readonly kind: "morphism";
    readonly id: string;
    readonly type: M;
    readonly label: string;
    readonly from: ObjectJudgment<ObjectTypesOf<S>> | null;
    readonly to: ObjectJudgment<ObjectTypesOf<S>> | null;
}

/** A judgment of an elaborated model.*/
export type JudgmentOf<S extends Shape> =
    | ObjectJudgment<ObjectTypesOf<S>>
    | MorphismJudgment<S, MorphismTypesOf<S>>;

/** Read-only, shape-typed access to an elaborated model.

The API mirrors the notebook's `cells`/`cellsOf`: judgments are returned in
presentation order (objects first, then morphisms). */
export interface ElaboratedModel<out S extends Shape> {
    judgments(): ReadonlyArray<JudgmentOf<S>>;
    judgmentsOf(typeOrShape: AnyCellType | Shape): ReadonlyArray<JudgmentOf<S>>;
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
                label: displayLabel(generator),
            };
            objectsById.set(generator.id, judgment);
            objects.push(judgment);
        }

        const morphisms: MorphismJudgment<S, MorphismTypesOf<S>>[] = [];
        for (const generator of presentation.morGenerators) {
            const type = findMorphismType(shape, generator.morType);
            if (type === undefined) {
                continue;
            }
            morphisms.push({
                kind: "morphism",
                id: generator.id,
                type,
                label: displayLabel(generator),
                from: endpointJudgment(objectsById, generator.dom),
                to: endpointJudgment(objectsById, generator.cod),
            });
        }

        return [...objects, ...morphisms];
    }

    return {
        judgments,
        judgmentsOf(typeOrShape: AnyCellType | Shape): ReadonlyArray<JudgmentOf<S>> {
            return judgments().filter((judgment) => judgmentMatchesFilter(judgment, typeOrShape));
        },
    };
}

function displayLabel(generator: Pick<ObGenerator, "label">): string {
    return generator.label?.join(".") ?? "";
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
        }
    }

    if (judgment.kind === "object") {
        return (filter.objects ?? []).some((type) =>
            objectTypesEqual(judgment.type.obType, type.obType),
        );
    }
    return (filter.morphisms ?? []).some((type) =>
        morphismTypesEqual(judgment.type.morType, type.morType),
    );
}
