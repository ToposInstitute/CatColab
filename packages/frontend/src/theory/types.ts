import type { KbdKey } from "@solid-primitives/keyboard";

import type { DblTheory, MorType, ObType } from "catlog-wasm";
import { MorTypeIndex, ObTypeIndex } from "catlog-wasm";
import type { ModelViewComponent } from "../model";
import type { ArrowStyle } from "../visualization/types";
import { uniqueIndexArray } from "../util/indexing";

/** A double theory configured for use in the frontend.
 */
export class Theory {
    /** Unique identifier of theory. */
    readonly id: TheoryId;

    /** Human-readable name for models of theory. */
    readonly name: string;

    /** Short description of models of theory. */
    readonly description?: string;

    /** Underlying double theory in the core. */
    readonly theory: DblTheory;

    /** Types in theory bound with metadata, to be displayed in this order. */
    readonly types: TypeMeta[];

    /** Whether models of the double theory are constrained to be free. */
    readonly onlyFreeModels!: boolean;

    private readonly obTypeIndex: ObTypeIndex;
    private readonly morTypeIndex: MorTypeIndex;
    private readonly modelViewMap: Map<string, ModelViewMeta<unknown>>;

    constructor(props: {
        id: string;
        name: string;
        description?: string;
        theory: DblTheory;
        types?: TypeMeta[];
        modelViews?: ModelViewMeta<unknown>[];
        onlyFreeModels?: boolean;
    }) {
        this.id = props.id;
        this.name = props.name;
        this.description = props.description;

        this.obTypeIndex = new ObTypeIndex();
        this.morTypeIndex = new MorTypeIndex();
        this.theory = props.theory;
        this.types = [];
        props.types?.forEach(this.bindType, this);

        this.modelViewMap = uniqueIndexArray(props.modelViews ?? [], meta => meta.id);
        this.onlyFreeModels = props.onlyFreeModels ?? false;
    }

    private bindType(meta: TypeMeta) {
        const index = this.types.length;
        if (meta.tag === "ObType") {
            this.obTypeIndex.set(meta.obType, index);
        } else if (meta.tag === "MorType") {
            this.morTypeIndex.set(meta.morType, index);
        }
        this.types.push(meta);
    }

    /** Get metadata for an object type. */
    getObTypeMeta(typ: ObType): ObTypeMeta | undefined {
        const i = this.obTypeIndex.get(typ);
        return i != null ? (this.types[i] as ObTypeMeta) : undefined;
    }

    /** Get metadata for an morphism type. */
    getMorTypeMeta(typ: MorType): MorTypeMeta | undefined {
        const i = this.morTypeIndex.get(typ);
        return i != null ? (this.types[i] as MorTypeMeta) : undefined;
    }

    /** Get metadata for a model view. */
    getModelView(id: string): ModelViewMeta<unknown> | undefined {
        return this.modelViewMap.get(id);
    }

    /** Iterate over model views. */
    modelViews(): IterableIterator<ModelViewMeta<unknown>> {
        return this.modelViewMap.values();
    }
}

/** Unique identifier of a theory exposed to the frontend.
 */
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

/** Frontend metadata for an object type in a double theory.
 */
export type ObTypeMeta = BaseTypeMeta & {
    tag: "ObType";

    /** Object type in underlying theory. */
    obType: ObType;
};

/** Frontend metadata for a morphism type in a double theory.
 */
export type MorTypeMeta = BaseTypeMeta & {
    tag: "MorType";

    /** Morphism type in underlying theory. */
    morType: MorType;

    /** Style of arrow to use for morphisms of this type. */
    arrowStyle?: ArrowStyle;

    /** Whether morphisms of this type are typically unnamed.

    By default, morphisms (like objects) have names but for certain morphism
    types in certain domains, it is common to leave them unnamed.
     */
    preferUnnamed?: boolean;
};

/** A model view along with descriptive metadata.
 */
export type ModelViewMeta<T> = {
    /** Identifier of view, unique relative to the theory. */
    id: string;

    /** Human-readable name of view. */
    name: string;

    /** Short description of view. */
    description?: string;

    /** Component that renders the view. */
    component: ModelViewComponent<T>;

    /** Default content created when the view is added. */
    initialContent: () => T;
};
