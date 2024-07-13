import { Newtype, iso } from "newtype-ts";
import { KbdKey } from "@solid-primitives/keyboard";

import { DiscreteDblTheory } from "catlog-wasm";


/** A double theory with frontend metadata.
 */
export type TheoryMeta = {
    // Unique identifier of theory.
    id: TheoryId;

    // Human-readable name for models of theory.
    name: string;

    // One-line description of models of theory.
    description?: string;

    // The underlying double theory.
    theory: DiscreteDblTheory;

    // Types in the double theory, to be displayed in this order.
    types: TypeMeta[];

    // Whether models of the double theory are constrained to be free.
    free?: boolean;
};

export interface TheoryId
extends Newtype<{ readonly TheoryId: unique symbol }, string> {}

export const isoTheoryId = iso<TheoryId>();


/** A type in a double theory with frontend metadata.
 */
export type TypeMeta = ObTypeMeta | MorTypeMeta;

type BaseTypeMeta = {
    // Unique identifier of type.
    id: string;

    // Human-readable name of type.
    name: string;

    // One-line description of type.
    description?: string;

    // Keyboard shortcut for type, excluding modifier.
    shortcut?: KbdKey[];
};

export type ObTypeMeta = BaseTypeMeta & {
    tag: "ob_type";
};

export type MorTypeMeta = BaseTypeMeta & {
    tag: "mor_type";

    // Style of arrow to use for morphisms of this type.
    // TODO: Not yet used. Should be an enum.
    arrow_style?: string;
};
