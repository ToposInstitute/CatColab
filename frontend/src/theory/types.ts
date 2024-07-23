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
    readonly theory: DiscreteDblTheory;

    // Types in theory bound with metadata, to be displayed in this order.
    readonly types: TypeMeta[];

    // Whether models of the double theory are constrained to be free.
    readonly onlyFree!: boolean;

    constructor(props: {
        id: string;
        name: string;
        description?: string;
        theory: () => DiscreteDblTheory;
        types?: TypeMeta[];
        onlyFree?: boolean;
    }) {
        this.theory = props.theory();
        this.types = [];
        props.types?.forEach(this.bindType, this);

        const {id, name, description} = props;
        Object.assign(this, {
            id, name, description,
            onlyFree: props.onlyFree ?? false,
        });
    }

    bindType(meta: TypeMeta) {
        const index = this.types.length;
        if (meta.tag === "ob_type") {
            this.theory.setObTypeIndex(meta.obType, index);
        } else if (meta.tag === "mor_type") {
            this.theory.setMorTypeIndex(meta.morType, index);
        }
        this.types.push(meta);
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

export type TheoryId = string;


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
