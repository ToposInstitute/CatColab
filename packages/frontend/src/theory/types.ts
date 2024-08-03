import type { KbdKey } from "@solid-primitives/keyboard";

import type { DblTheory, MorType, ObType } from "catlog-wasm";
import type { ArrowStyle } from "../visualization/types";

/** A double theory equipped with metadata for use in frontend.
 */
export class TheoryMeta {
    /** Unique identifier of theory. */
    readonly id!: TheoryId;

    /** Human-readable name for models of theory. */
    readonly name!: string;

    /** Short description of models of theory. */
    readonly description?: string;

    /** Underlying double theory in the core. */
    readonly theory: DblTheory;

    /** Types in theory bound with metadata, to be displayed in this order. */
    readonly types: TypeMeta[];

    /** Whether models of the double theory are constrained to be free. */
    readonly onlyFree!: boolean;

    constructor(props: {
        id: string;
        name: string;
        description?: string;
        theory: () => DblTheory;
        types?: TypeMeta[];
        onlyFree?: boolean;
    }) {
        this.theory = props.theory();
        this.types = [];
        props.types?.forEach(this.bindType, this);

        const { id, name, description } = props;
        Object.assign(this, {
            id,
            name,
            description,
            onlyFree: props.onlyFree ?? false,
        });
    }

    private bindType(meta: TypeMeta) {
        const index = this.types.length;
        if (meta.tag === "ObType") {
            this.theory.setObTypeIndex(meta.obType, index);
        } else if (meta.tag === "MorType") {
            this.theory.setMorTypeIndex(meta.morType, index);
        }
        this.types.push(meta);
    }

    /** Get metadata associated with object type. */
    getObTypeMeta(typ: ObType): ObTypeMeta | undefined {
        const i = this.theory.obTypeIndex(typ);
        return i != null ? (this.types[i] as ObTypeMeta) : undefined;
    }

    /** Get metadata associated with morphism type. */
    getMorTypeMeta(typ: MorType): MorTypeMeta | undefined {
        const i = this.theory.morTypeIndex(typ);
        return i != null ? (this.types[i] as MorTypeMeta) : undefined;
    }
}

export type TheoryId = string;

/** A type in a double theory equipped with frontend metadata.
 */
export type TypeMeta = ObTypeMeta | MorTypeMeta;

/** Frontend metadata applicable to any type in a double theory.
 */
export type BaseTypeMeta = {
    /** Human-readable name of type. */
    name: string;

    /** Short description of type. */
    description?: string;

    /** Keyboard shortcut for type, excluding modifier. */
    shortcut?: KbdKey[];

    /** CSS classes to apply to HTML displays. */
    cssClasses?: string[];

    /** CSS classes to apply to SVG displays. */
    svgClasses?: string[];

    /** CSS classes to apply to text in both HTML and SVG. */
    textClasses?: string[];
};

/** Frontend metadata for object types in a double theory.
 */
export type ObTypeMeta = BaseTypeMeta & {
    tag: "ObType";

    /** Object type in underlying theory. */
    obType: ObType;
};

/** Frontend metadata for morphism types in a double theory.
 */
export type MorTypeMeta = BaseTypeMeta & {
    tag: "MorType";

    /** Morphism type in underlying theory. */
    morType: MorType;

    /** Style of arrow to use for morphisms of this type. */
    arrowStyle?: ArrowStyle;
};
