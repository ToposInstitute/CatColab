import { Newtype, iso } from "newtype-ts";

import { MorType, ObType } from "catlog-wasm";
import { generateId } from "../util/id";
import { TheoryId } from "../theory";
import { Notebook } from "../notebook";


/** A model of a discrete double theory in notebook form.
 */
export type ModelNotebook = {
    // User-defined name of model.
    name: string;

    // Identifier of double theory that the model is of.
    theory?: TheoryId;

    // Content of the model, formal and informal.
    notebook: Notebook<ModelJudgment>;
}


/** A judgment in the definition of a model.

TODO: Judgments can be declarations *or* morphism equations.
 */
export type ModelJudgment = ModelDecl;

export type ModelDecl = ObjectDecl | MorphismDecl;

/** Declaration of an object in a model.
 */
export type ObjectDecl = {
    tag: "object";

    // Globally unique identifier of declaration.
    id: ObjectId;

    // Human-readable name of object.
    name: string;

    // Identifier of object type in double theory.
    type: ObType;
};

export const newObjectDecl = (type: ObType): ObjectDecl => ({
    tag: "object",
    id: isoObjectId.wrap(generateId()),
    name: "",
    type: type,
});

export interface ObjectId
extends Newtype<{ readonly ObjectId: unique symbol }, string> {}

export const isoObjectId = iso<ObjectId>();

/** Declaration of a morphim in a model.
 */
export type MorphismDecl = {
    tag: "morphism";

    // Globally unique identifier of declaration.
    id: MorphismId;

    // Human-readable name of object.
    name: string;

    // Identifier of morphism type in double theory.
    type: MorType;

    // Domain of morphism.
    dom: ObjectId | null;

    // Codmain of morphism.
    cod: ObjectId | null;
};

export const newMorphismDecl = (type: MorType): MorphismDecl => ({
    tag: "morphism",
    id: isoMorphismId.wrap(generateId()),
    name: "",
    type: type,
    dom: null,
    cod: null,
});

export interface MorphismId
extends Newtype<{ readonly MorphismId: unique symbol }, string> {}

export const isoMorphismId = iso<MorphismId>();
