import { Newtype, iso } from "newtype-ts";

import { generateId } from "../util/id";
import { Notebook } from "../notebook";


/** A model of a discrete double theory in notebook form.
 */
export type NotebookModel = {
    // User-defined name of model.
    name: string;

    // Identifier of double theory that the model is of.
    theory?: string;

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
    type: string;
};

export const newObjectDecl = (type: string): ObjectDecl => ({
    tag: "object",
    id: isoObjectId.wrap(generateId()),
    name: "",
    type: type,
});

export interface ObjectId
extends Newtype<{ readonly ObjectId: unique symbol }, string> {}

const isoObjectId = iso<ObjectId>();

/** Declaration of a morphim in a model.
 */
export type MorphismDecl = {
    tag: "morphism";

    // Globally unique identifier of declaration.
    id: MorphismId;

    // Human-readable name of object.
    name: string;

    // Identifier of morphism type in double theory.
    type: string;

    // Domain of morphism.
    dom: ObjectId | null;

    // Codmain of morphism.
    cod: ObjectId | null;
};

export const newMorphismDecl = (type: string): MorphismDecl => ({
    tag: "morphism",
    id: isoMorphismId.wrap(generateId()),
    name: "",
    type: type,
    dom: null,
    cod: null,
});

export interface MorphismId
extends Newtype<{ readonly MorphismId: unique symbol }, string> {}

const isoMorphismId = iso<MorphismId>();
