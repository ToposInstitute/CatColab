import type { KbdKey } from "@solid-primitives/keyboard";

import type { DblModel, DblTheory, MorType, ObOp, ObType } from "catlog-wasm";
import { MorTypeIndex, ObTypeIndex } from "catlog-wasm";
import type { DiagramAnalysisComponent, ModelAnalysisComponent } from "../analysis";
import { uniqueIndexArray } from "../util/indexing";
import type { ArrowStyle } from "../visualization";

/** A double theory configured for the frontend.

This class augments a double theory as defined in the core with metadata about
how to display models of the theory and instances of models.
 */
export class Theory {
    /** Unique identifier of theory. */
    readonly id: string;

    /** Underlying double theory in the core. */
    readonly theory: DblTheory;

    /** Does this theory have a corresponding help page? */
    readonly help?: boolean;

    /** Human-readable name for models of theory.

    In the frontend, theories are named after their models, so this name doubles
    as a name for the theory itself.
     */
    readonly name: string;

    /** Short description of models of theory.

    It should fit confortably in a single line.
     */
    readonly description: string;

    /** List of IDs of theories that this theory includes into.

    Migrations along such inclusions are trivial.
     */
    readonly inclusions: string[];

    /** List of pushforward (covariant) migrations out of this theory. */
    readonly pushforwards: ModelMigration[];

    /** Whether models of the double theory are constrained to be free. */
    readonly onlyFreeModels!: boolean;

    /** Human-readable name for instances of models of theory.

    Defaults to "Instance of".
     */
    readonly instanceOfName: string;

    private readonly modelTypeMeta: TypeMetadata<ModelObTypeMeta, ModelMorTypeMeta>;
    private readonly instanceTypeMeta: TypeMetadata<InstanceObTypeMeta, InstanceMorTypeMeta>;

    /** Map from IDs of model analyses to their metadata. */
    private readonly modelAnalysisMap: Map<string, ModelAnalysisMeta>;

    /** Map from IDs of diagram analyses to their metadata. */
    private readonly diagramAnalysisMap: Map<string, DiagramAnalysisMeta>;

    constructor(props: {
        id: string;
        theory: DblTheory;
        help?: boolean;
        name: string;
        description: string;
        inclusions?: string[];
        pushforwards?: ModelMigration[];
        modelTypes?: ModelTypeMeta[];
        modelAnalyses?: ModelAnalysisMeta[];
        onlyFreeModels?: boolean;
        instanceOfName?: string;
        instanceTypes?: InstanceTypeMeta[];
        diagramAnalyses?: DiagramAnalysisMeta[];
    }) {
        // Theory.
        this.id = props.id;
        this.theory = props.theory;
        this.help = props.help;

        // Migrations.
        this.inclusions = props.inclusions ?? [];
        this.pushforwards = props.pushforwards ?? [];

        // Models.
        this.name = props.name;
        this.description = props.description;
        this.modelTypeMeta = new TypeMetadata<ModelObTypeMeta, ModelMorTypeMeta>(props.modelTypes);
        this.modelAnalysisMap = uniqueIndexArray(props.modelAnalyses ?? [], (meta) => meta.id);
        this.onlyFreeModels = props.onlyFreeModels ?? false;

        // Instances.
        this.instanceOfName = props.instanceOfName ?? "Instance of";
        this.instanceTypeMeta = new TypeMetadata<InstanceObTypeMeta, InstanceMorTypeMeta>(
            props.instanceTypes,
        );
        this.diagramAnalysisMap = uniqueIndexArray(props.diagramAnalyses ?? [], (meta) => meta.id);
    }

    /** List of IDs of theories to which models of this theory can be migrated. */
    get migrationTargets(): Array<string> {
        return this.inclusions.concat(this.pushforwards.map((m) => m.target));
    }

    /** Metadata for types in the theory, as used in models.

    In a model editor, the types are listed in this order.
     */
    get modelTypes(): Array<ModelTypeMeta> {
        return this.modelTypeMeta.types;
    }

    /** Get metadata for an object type as used in models. */
    modelObTypeMeta(typ: ObType): ModelObTypeMeta | undefined {
        return this.modelTypeMeta.obTypeMeta(typ);
    }

    /** Get metadata for a morphism type as used in models. */
    modelMorTypeMeta(typ: MorType): ModelMorTypeMeta | undefined {
        return this.modelTypeMeta.morTypeMeta(typ);
    }

    /** Is the theory configured to support instances of its model? */
    get supportsInstances(): boolean {
        return this.instanceTypes.length > 0;
    }

    /** Metadata for types in the theory, as used in instances of models.

    In an instance editor, the types are listed in this order. If the list is
    empty, then instances will not be supported for models of this theory.
     */
    get instanceTypes(): Array<InstanceTypeMeta> {
        return this.instanceTypeMeta.types;
    }

    /** Get metadata for an object type as used in instances. */
    instanceObTypeMeta(typ: ObType): InstanceObTypeMeta | undefined {
        return this.instanceTypeMeta.obTypeMeta(typ);
    }

    /** Get metadata for a morphism type as used in instances. */
    instanceMorTypeMeta(typ: MorType): InstanceMorTypeMeta | undefined {
        return this.instanceTypeMeta.morTypeMeta(typ);
    }

    /** List of analyses defined for models. */
    get modelAnalyses(): Array<ModelAnalysisMeta> {
        return Array.from(this.modelAnalysisMap.values());
    }

    /** Get metadata for a model analysis. */
    modelAnalysis(id: string): ModelAnalysisMeta | undefined {
        return this.modelAnalysisMap.get(id);
    }

    /** List of analyses defined for diagrams. */
    get diagramAnalyses(): Array<DiagramAnalysisMeta> {
        return Array.from(this.diagramAnalysisMap.values());
    }

    /** Get metadata for a diagram analysis. */
    diagramAnalysis(id: string): DiagramAnalysisMeta | undefined {
        return this.diagramAnalysisMap.get(id);
    }
}

/** Helper class to index and lookup metadata for object and morphism types. */
class TypeMetadata<ObMeta extends HasObTypeMeta, MorMeta extends HasMorTypeMeta> {
    readonly types: Array<ObMeta | MorMeta>;

    private readonly obTypeIndex: ObTypeIndex;
    private readonly morTypeIndex: MorTypeIndex;

    constructor(types?: Array<ObMeta | MorMeta>) {
        this.types = [];
        this.obTypeIndex = new ObTypeIndex();
        this.morTypeIndex = new MorTypeIndex();
        types?.forEach(this.bindMeta, this);
    }

    private bindMeta(meta: ObMeta | MorMeta) {
        const index = this.types.length;
        if (meta.tag === "ObType") {
            this.obTypeIndex.set(meta.obType, index);
        } else if (meta.tag === "MorType") {
            this.morTypeIndex.set(meta.morType, index);
        }
        this.types.push(meta);
    }

    obTypeMeta(typ: ObType): ObMeta | undefined {
        const i = this.obTypeIndex.get(typ);
        return i !== undefined ? (this.types[i] as ObMeta) : undefined;
    }

    morTypeMeta(typ: MorType): MorMeta | undefined {
        const i = this.morTypeIndex.get(typ);
        return i !== undefined ? (this.types[i] as MorMeta) : undefined;
    }
}

/** Frontend metadata applicable to any type in a double theory. */
export type BaseTypeMeta = {
    /** Human-readable name of type. */
    name: string;

    /** Short description of type. */
    description: string;

    /** Keyboard shortcut for type, excluding modifier. */
    shortcut?: KbdKey[];

    /** CSS classes to apply to HTML displays. */
    cssClasses?: string[];

    /** CSS classes to apply to SVG displays. */
    svgClasses?: string[];

    /** CSS classes to apply to text in both HTML and SVG. */
    textClasses?: string[];
};

type HasObTypeMeta = {
    tag: "ObType";

    /** Object type in the underlying double theory. */
    obType: ObType;
};

type HasMorTypeMeta = {
    tag: "MorType";

    /** Morphism type in the underlying double theory. */
    morType: MorType;
};

type BaseObTypeMeta = BaseTypeMeta & HasObTypeMeta;
type BaseMorTypeMeta = BaseTypeMeta & HasMorTypeMeta;

/** Metadata for a type as used in models. */
export type ModelTypeMeta = ModelObTypeMeta | ModelMorTypeMeta;

/** Metadata for an object type as used in models. */
export type ModelObTypeMeta = BaseObTypeMeta;

/** Metadata for a morphism type as used in models. */
export type ModelMorTypeMeta = BaseMorTypeMeta & {
    /** Style of arrow to use for morphisms of this type. */
    arrowStyle?: ArrowStyle;

    /** Whether morphisms of this type are typically unnamed.

    By default, morphisms (like objects) have names but for certain morphism
    types in certain domains, it is common to leave them unnamed.
     */
    preferUnnamed?: boolean;

    /** Metadata for domain of morphism of this type. */
    domain?: MorDomainMeta;

    /** Metadata for codomain of morphism of this type. */
    codomain?: MorDomainMeta;
};

/** Metadata controlling the domain or codomain of a morphism. */
export type MorDomainMeta = {
    /** Domain object be application of this operation. */
    apply?: ObOp;
};

/** Metadata for a type as used in instances of a model. */
export type InstanceTypeMeta = InstanceObTypeMeta | InstanceMorTypeMeta;

/** Metadata for an object type as used in instances. */
export type InstanceObTypeMeta = BaseObTypeMeta;

/** Metadata for a morphism type as used in instances. */
export type InstanceMorTypeMeta = BaseMorTypeMeta & {
	/** Style of arrow to use for morphisms of this type. */
	arrowStyle?: ArrowStyle;

	/** Whether morphism of this type are typically unnamed.
	
	By defualt, morphisms (like objects) have named but for certain morphism
	types in certain domains, it is common to leave them unnamed.
	*/
	preferUnnamed?: boolean;

	/** Metadata for domain of morphisms of this type. */
	domain?: MorDomainMeta;

	/** Metadata for codomain of morphism of this type. */
	codomain?: MorDomainMeta;
};

/** Specifies a migration of models from one theory into another. */
type ModelMigration = {
    /** Identifier of theory migrated into. */
    target: string;

    /** Function to perform the migration. */
    migrate: (model: DblModel, targetTheory: DblTheory) => DblModel;
};

/** Specifies an analysis with descriptive metadata. */
export type AnalysisMeta<T> = {
    /** Identifier of analysis, unique relative to the theory. */
    id: string;

    /** Human-readable name of analysis. */
    name: string;

    /** Short description of analysis. */
    description?: string;

    /** Name of the help page (excluding file extension) for the analysis, if any. */
    help?: string;

    /** Default content created when the analysis is added. */
    initialContent: () => T;
};

/** Specifies a model analysis with descriptive metadata. */
// biome-ignore lint/suspicious/noExplicitAny: content type is data dependent.
export type ModelAnalysisMeta<T = any> = AnalysisMeta<T> & {
    /** Component that renders the analysis. */
    component: ModelAnalysisComponent<T>;
};

/** Specifies a diagram analysis with descriptive metadata. */
// biome-ignore lint/suspicious/noExplicitAny: content type is data dependent.
export type DiagramAnalysisMeta<T = any> = AnalysisMeta<T> & {
    /** Component that renders the analysis. */
    component: DiagramAnalysisComponent<T>;
};
