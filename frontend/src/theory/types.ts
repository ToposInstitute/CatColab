import { Newtype, iso } from "newtype-ts";
import { KbdKey } from "@solid-primitives/keyboard";

import { DiscreteDblTheory, ObType, MorType } from "catlog-wasm";
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
    types: TypeMeta[];

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
    theory: () => DiscreteDblTheory;
    types: TypeMeta[];
    onlyFree?: boolean;
}): TheoryMeta {
    const {name, description, types} = meta;
    const theory = meta.theory();

    for (const [i, typeMeta] of types.entries()) {
        if (typeMeta.tag === "ob_type") {
            theory.setObTypeIndex(typeMeta.obType, i);
        } else if (typeMeta.tag === "mor_type") {
            theory.setMorTypeIndex(typeMeta.morType, i);
        }
    }

    return {
        id: isoTheoryId.wrap(meta.id),
        name, description, theory, types,
        onlyFree: meta.onlyFree ?? false,
    };
}

export function getObTypeMeta(meta: TheoryMeta,
                              typ: ObType): ObTypeMeta | undefined {
    const i = meta.theory.obTypeIndex(typ);
    return i != null ? (meta.types[i] as ObTypeMeta) : undefined;
}

export function getMorTypeMeta(meta: TheoryMeta,
                               typ: MorType): MorTypeMeta | undefined {
    const i = meta.theory.morTypeIndex(typ);
    return i != null ? (meta.types[i] as MorTypeMeta) : undefined;
}


/** A type in a double theory with frontend metadata.
 */
export type TypeMeta = ObTypeMeta | MorTypeMeta;

type BaseTypeMeta = {
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

    // Object type in underlying theory.
    obType: ObType;
};

export type MorTypeMeta = BaseTypeMeta & {
    tag: "mor_type";

    // Morphism type in underlying theory.
    morType: MorType;

    // Style of arrow to use for morphisms of this type.
    arrowStyle?: ArrowStyle;
};
