import { Newtype, iso } from "newtype-ts";
import { KbdKey } from "@solid-primitives/keyboard";

import { DiscreteDblTheory, ObType, MorType } from "catlog-wasm";
import { ArrowStyle } from "../visualization/types";


/** A double theory with frontend metadata.
 */
export class TheoryMeta {
    // Unique identifier of theory.
    readonly id!: TheoryId;

    // Human-readable name for models of theory.
    readonly name!: string;

    // Tooltip-length description of models of theory.
    readonly description?: string;

    // The underlying double theory.
    readonly theory!: DiscreteDblTheory;

    // Types in the double theory, to be displayed in this order.
    readonly types!: TypeMeta[];

    // Whether models of the double theory are constrained to be free.
    readonly onlyFree!: boolean;

    constructor(props: {
        id: string;
        name: string;
        description?: string;
        theory: () => DiscreteDblTheory;
        types: TypeMeta[];
        onlyFree?: boolean;
    }) {
        const {name, description, types} = props;
        const theory = props.theory();

        for (const [i, typeMeta] of types.entries()) {
            if (typeMeta.tag === "ob_type") {
                theory.setObTypeIndex(typeMeta.obType, i);
            } else if (typeMeta.tag === "mor_type") {
                theory.setMorTypeIndex(typeMeta.morType, i);
            }
        }

        Object.assign(this, {
            id: isoTheoryId.wrap(props.id),
            name, description, theory, types,
            onlyFree: props.onlyFree ?? false,
        });
    }

    getObTypeMeta(typ: ObType): ObTypeMeta | undefined {
        const i = this.theory.obTypeIndex(typ);
        return i != null ? (this.types[i] as ObTypeMeta) : undefined;
    }

    getMorTypeMeta(typ: MorType): MorTypeMeta | undefined {
        const i = this.theory.morTypeIndex(typ);
        return i != null ? (this.types[i] as MorTypeMeta) : undefined;
    }
}

export interface TheoryId
extends Newtype<{ readonly TheoryId: unique symbol }, string> {}

export const isoTheoryId = iso<TheoryId>();


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
