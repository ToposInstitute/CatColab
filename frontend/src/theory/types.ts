import { Newtype, iso } from "newtype-ts";
import { KbdKey } from "@solid-primitives/keyboard";

import { uniqueIndexArray } from "../util/indexing";
import { DiscreteDblTheory } from "catlog-wasm";
import { ArrowStyle } from "../visualization/types";


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
    onlyFree: boolean;
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
    onlyFree?: boolean;
}): TheoryMeta {
    const {name, description, theory} = meta;
    return {
        id: isoTheoryId.wrap(meta.id),
        name, description, theory,
        types: uniqueIndexArray(meta.types, t => t.id),
        onlyFree: meta.onlyFree ?? false,
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

    // Keyboard shortcut for type, excluding modifier.
    shortcut?: KbdKey[];

    // CSS classes to apply to HTML displays.
    cssClasses?: string[];

    // CSS classes to apply to SVG displays.
    svgClasses?: string[];

    // CSS classes to apply to text in both HTML and SVG.
    textClasses?: string[];
};

export type ObTypeMeta = BaseTypeMeta & {
    tag: "ob_type";
};

export type MorTypeMeta = BaseTypeMeta & {
    tag: "mor_type";

    // Style of arrow to use for morphisms of this type.
    arrowStyle?: ArrowStyle;
};
