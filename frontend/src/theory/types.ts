import { Newtype, iso } from "newtype-ts";
import { KbdKey } from "@solid-primitives/keyboard";

import { uniqueIndexArray } from "../util/indexing";
import { DiscreteDblTheory } from "catlog-wasm";


/** A double theory with frontend metadata.
 */
export type TheoryMeta = {
    // Unique identifier of theory.
    id: TheoryId;

    // Human-readable name for models of theory.
    name: string;

    // Tooltip-length description of models of theory.
    description?: string;

    // The underlying double theory.
    theory: DiscreteDblTheory;

    // Types in the double theory, to be displayed in this order.
    types: Map<string, TypeMeta>;

    // Whether models of the double theory are constrained to be free.
    only_free: boolean;
};

export interface TheoryId
extends Newtype<{ readonly TheoryId: unique symbol }, string> {}

export const isoTheoryId = iso<TheoryId>();

export function createTheoryMeta(meta: {
    id: string;
    name: string;
    description?: string;
    theory: DiscreteDblTheory;
    types: TypeMeta[];
    only_free?: boolean;
}): TheoryMeta {
    const {name, description, theory} = meta;
    return {
        id: isoTheoryId.wrap(meta.id),
        name, description, theory,
        types: uniqueIndexArray(meta.types, t => t.id),
        only_free: meta.only_free ?? false,
    };
}


/** A type in a double theory with frontend metadata.
 */
export type TypeMeta = ObTypeMeta | MorTypeMeta;

type BaseTypeMeta = {
    // Unique identifier of type.
    id: string;

    // Human-readable name of type.
    name: string;

    // Tooltip-length description of type.
    description?: string;

    // CSS class to apply to editors for elements of this type.
    cssClasses?: string[];

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
    arrowStyle?: string;
};
