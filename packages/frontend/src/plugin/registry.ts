import type { AnalysisType } from "catcolab-document-types";
import type { Doctrine } from "catlog-wasm";
import type { AnalysisBuilder, DiagramAnalysisBuilder, ModelAnalysisBuilder } from "../analysis";
import type {
    AnalysisManifest,
    AnalysisContribution,
    DiagramAnalysisContribution,
    ModelAnalysisContribution,
} from "./types";

/** Registry of plugins.

The registry covers only analysis plugins, since that's the only kind of plugin
that exists so far. In the future it will be possible to contribute theories,
models, and possibly other functionality as plugins.
 */
export class PluginRegistry {
    private readonly contributions: Map<string, AnalysisContribution>;

    /** Loaded analysis builders, keyed by contribution ID. */
    private readonly analysisBuilders: Map<string, AnalysisBuilder<unknown>>;

    constructor() {
        this.contributions = new Map();
        this.analysisBuilders = new Map();
    }

    /** Adds a plugin to the registry. */
    add(plugin: Array<AnalysisContribution>) {
        for (const contribution of plugin) {
            if (this.contributions.has(contribution.id)) {
                throw new Error(`Contribution with ID ${contribution.id} already exists`);
            }
            this.contributions.set(contribution.id, contribution);
        }
    }

    /** Gets the analyses available for a model. */
    modelAnalyses(key: AnalysisScopeKey): AnalysisManifest[] {
        return this.analyses("model", key);
    }

    /** Gets the analyses available for a diagram. */
    diagramAnalyses(key: AnalysisScopeKey): AnalysisManifest[] {
        return this.analyses("diagram", key);
    }

    /** Gets the analyses of the given type available for an entity. */
    analyses(type: AnalysisType, key: AnalysisScopeKey): AnalysisManifest[] {
        const manifests: AnalysisManifest[] = [];
        for (const contribution of this.contributions.values()) {
            if (contribution.type === type && isKeyInScope(contribution, key)) {
                manifests.push(contribution);
            }
        }
        return manifests;
    }

    /** Gets the manifest for an analysis, if it exists. */
    analysisManifest(id: string): AnalysisManifest | undefined {
        return this.contributions.get(id);
    }

    /** Gets the builder for an analysis of any type, loading it if necessary. */
    analysisBuilder(id: string): Promise<AnalysisBuilder<unknown>> {
        const contribution = this.contributions.get(id);
        if (!contribution) {
            throw new Error(`No analysis with ID ${id}`);
        }
        return this.load(contribution);
    }

    /** Gets the builder for a model analysis, loading it if necessary. */
    modelAnalysisBuilder(id: string): Promise<ModelAnalysisBuilder<unknown>> {
        const contribution = this.contributions.get(id);
        if (contribution?.type !== "model") {
            throw new Error(`No model analysis with ID ${id}`);
        }
        return this.load(contribution);
    }

    /** Gets the builder for a diagram analysis, loading it if necessary. */
    diagramAnalysisBuilder(id: string): Promise<DiagramAnalysisBuilder<unknown>> {
        const contribution = this.contributions.get(id);
        if (contribution?.type !== "diagram") {
            throw new Error(`No diagram analysis with ID ${id}`);
        }
        return this.load(contribution);
    }

    private load(contribution: ModelAnalysisContribution): Promise<ModelAnalysisBuilder<unknown>>;
    private load(
        contribution: DiagramAnalysisContribution,
    ): Promise<DiagramAnalysisBuilder<unknown>>;
    private load(contribution: AnalysisContribution): Promise<AnalysisBuilder<unknown>>;
    private async load(contribution: AnalysisContribution) {
        let builder = this.analysisBuilders.get(contribution.id);
        if (!builder) {
            builder = await contribution.load(contribution);
            this.analysisBuilders.set(contribution.id, builder);
        }
        return builder;
    }
}

/** Key against which the scope of an analysis is matched. */
type AnalysisScopeKey = {
    doctrine: Doctrine;
    theory: string;
};

/** Does the key satisfy all the constraints in the manifest's scope? */
function isKeyInScope(manifest: AnalysisManifest, key: AnalysisScopeKey): boolean {
    const { doctrine, theory, model } = manifest.scope;
    if (model !== undefined) {
        throw new Error("`model` scope is not implemented");
    }
    return (
        (doctrine === undefined || doctrine.includes(key.doctrine)) &&
        (theory === undefined || theory.includes(key.theory))
    );
}
