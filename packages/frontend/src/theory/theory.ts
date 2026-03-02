import type { KbdKey } from "catcolab-ui-components";
import type { DblModel, DblTheory, MorType, ObOp, ObType } from "catlog-wasm";
import type { DiagramAnalysisComponent, ModelAnalysisComponent } from "../analysis";
import { uniqueIndexArray } from "../util/indexing";
import type { ArrowStyle } from "../visualization";
import { MorTypeMap, ObTypeMap } from "./types";

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

    /** Metadata for object and morphism types in the theory, as used in models.

    In a model editor, the types are listed in this order.
     */
    readonly modelTypes: ModelTypeMeta[];

    /** Whether models of the double theory are constrained to be free. */
    readonly onlyFreeModels!: boolean;

    /** Human-readable name for instances of models of theory.

    Defaults to "Instance of".
     */
    readonly instanceOfName: string;

    /** Metadata for types in the theory, as used in instances of models.

    In an instance editor, the types are listed in this order. If the list is
    empty, then instances will not be supported for models of this theory.
     */
    readonly instanceTypes: InstanceTypeMeta[];

    /** List of IDs of theories that this theory includes into.

    Migrations along such inclusions are trivial.
     */
    readonly inclusions: string[];

    /** List of pushforward (covariant) migrations out of this theory. */
    readonly pushforwards: ModelMigration[];

    private readonly modelObTypeMap: ObTypeMap<ModelObTypeMeta>;
    private readonly modelMorTypeMap: MorTypeMap<ModelMorTypeMeta>;
    private readonly instanceObTypeMap: ObTypeMap<InstanceObTypeMeta>;
    private readonly instanceMorTypeMap: MorTypeMap<InstanceMorTypeMeta>;

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
        this.modelTypes = props.modelTypes ?? [];
        [this.modelObTypeMap, this.modelMorTypeMap] = [new ObTypeMap(), new MorTypeMap()];
        for (const meta of this.modelTypes) {
            if (meta.tag === "ObType") {
                this.modelObTypeMap.set(meta.obType, meta);
            } else if (meta.tag === "MorType") {
                this.modelMorTypeMap.set(meta.morType, meta);
            } else {
                throw new Error(`Invalid discriminator for model-level type metadata: ${meta}`);
            }
        }
        this.modelAnalysisMap = uniqueIndexArray(props.modelAnalyses ?? [], (meta) => meta.id);
        this.onlyFreeModels = props.onlyFreeModels ?? false;

        // Instances.
        this.instanceOfName = props.instanceOfName ?? "Instance of";
        this.instanceTypes = props.instanceTypes ?? [];
        [this.instanceObTypeMap, this.instanceMorTypeMap] = [new ObTypeMap(), new MorTypeMap()];
        for (const meta of this.instanceTypes) {
            if (meta.tag === "ObType") {
                this.instanceObTypeMap.set(meta.obType, meta);
            } else if (meta.tag === "MorType") {
                this.instanceMorTypeMap.set(meta.morType, meta);
            } else {
                throw new Error(`Invalid discriminator for instance-level type metadata: ${meta}`);
            }
        }
        this.diagramAnalysisMap = uniqueIndexArray(props.diagramAnalyses ?? [], (meta) => meta.id);
    }

    /** List of IDs of theories to which models of this theory can be migrated. */
    get migrationTargets(): Array<string> {
        return this.inclusions.concat(this.pushforwards.map((m) => m.target));
    }

    /** Get metadata for an object type as used in models. */
    modelObTypeMeta(typ: ObType): ModelObTypeMeta | undefined {
        return this.modelObTypeMap.get(typ);
    }

    /** Get metadata for a morphism type as used in models. */
    modelMorTypeMeta(typ: MorType): ModelMorTypeMeta | undefined {
        return this.modelMorTypeMap.get(typ);
    }

    /** Is the theory configured to support instances of its model? */
    get supportsInstances(): boolean {
        return this.instanceTypes.length > 0;
    }

    /** Get metadata for an object type as used in instances. */
    instanceObTypeMeta(typ: ObType): InstanceObTypeMeta | undefined {
        return this.instanceObTypeMap.get(typ);
    }

    /** Get metadata for a morphism type as used in instances. */
    instanceMorTypeMeta(typ: MorType): InstanceMorTypeMeta | undefined {
        return this.instanceMorTypeMap.get(typ);
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

/** Metadata for a type as used in models. */
export type ModelTypeMeta =
    | ({ tag: "ObType" } & ModelObTypeMeta)
    | ({ tag: "MorType" } & ModelMorTypeMeta);

/** Metadata for an object type as used in models. */
export type ModelObTypeMeta = BaseTypeMeta & {
    /** Object type in the underlying double theory. */
    obType: ObType;
};

/** Metadata for a morphism type as used in models. */
export type ModelMorTypeMeta = BaseTypeMeta & {
    /** Morphism type in the underlying double theory. */
    morType: MorType;

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
export type InstanceTypeMeta =
    | ({ tag: "ObType" } & InstanceObTypeMeta)
    | ({ tag: "MorType" } & InstanceMorTypeMeta);

/** Metadata for an object type as used in instances. */
export type InstanceObTypeMeta = BaseTypeMeta & {
    /** Object type in the underlying double theory. */
    obType: ObType;
};

/** Metadata for a morphism type as used in instances. */
export type InstanceMorTypeMeta = BaseTypeMeta & {
    /** Morphism type in the underlying double theory. */
    morType: MorType;
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

    /** Optional run function for testing backward compatibility.

    When present, this function takes a compiled model and analysis content and
    runs the analysis. It exercises the same WASM deserialization path as the
    component would at runtime.
     */
    run?: (model: DblModel, data: T) => unknown;
};

/** Specifies a diagram analysis with descriptive metadata. */
// biome-ignore lint/suspicious/noExplicitAny: content type is data dependent.
export type DiagramAnalysisMeta<T = any> = AnalysisMeta<T> & {
    /** Component that renders the analysis. */
    component: DiagramAnalysisComponent<T>;
};
