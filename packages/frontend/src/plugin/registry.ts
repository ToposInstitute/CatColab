import type { AnalysisType } from "catcolab-document-types";
import type { Doctrine } from "catlog-wasm";
import type { AnalysisBuilder, DiagramAnalysisBuilder, ModelAnalysisBuilder } from "../analysis";
import type {
    AnalysisManifest,
    AnalysisPlugin,
    DiagramAnalysisPlugin,
    ModelAnalysisPlugin,
} from "./types";

/** Registry of plugins.

The registry covers only analysis plugins, since that's the only kind of plugin
that exists so far. In the future it will be possible to contribute theories,
models, and possibly other functionality as plugins.
 */
export class PluginRegistry {
    private readonly plugins: Map<string, AnalysisPlugin>;

    /** Cache of analysis manifests applicable to a scope, keyed by type and scope. */
    private readonly analysisManifests: Map<string, AnalysisManifest[]>;

    /** Cache of loaded analysis builders, keyed by plugin ID. */
    private readonly analysisBuilders: Map<string, AnalysisBuilder<unknown>>;

    constructor() {
        this.plugins = new Map();
        this.analysisManifests = new Map();
        this.analysisBuilders = new Map();
    }

    /** Adds a plugin to the registry. */
    add(plugin: AnalysisPlugin) {
        if (this.plugins.has(plugin.id)) {
            throw new Error(`Plugin with ID ${plugin.id} already exists`);
        }
        this.plugins.set(plugin.id, plugin);
        this.analysisManifests.clear();
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
        const cacheKey = JSON.stringify([type, key.doctrine, key.theory]);
        let manifests = this.analysisManifests.get(cacheKey);
        if (!manifests) {
            manifests = [];
            for (const plugin of this.plugins.values()) {
                if (plugin.type === type && isKeyInScope(plugin, key)) {
                    manifests.push(plugin);
                }
            }
            this.analysisManifests.set(cacheKey, manifests);
        }
        return manifests;
    }

    /** Gets the builder for an analysis of any type, loading it if necessary. */
    async analysisBuilder(id: string): Promise<AnalysisBuilder<unknown>> {
        const plugin = this.plugins.get(id);
        if (!plugin) {
            throw new Error(`No analysis with ID ${id}`);
        }
        return this.loadAnalysis(plugin);
    }

    /** Gets the builder for a model analysis, loading it if necessary. */
    async modelAnalysisBuilder(id: string): Promise<ModelAnalysisBuilder<unknown>> {
        const plugin = this.plugins.get(id);
        if (plugin?.type !== "model") {
            throw new Error(`No model analysis with ID ${id}`);
        }
        return this.loadAnalysis(plugin);
    }

    /** Gets the builder for a diagram analysis, loading it if necessary. */
    async diagramAnalysisBuilder(id: string): Promise<DiagramAnalysisBuilder<unknown>> {
        const plugin = this.plugins.get(id);
        if (plugin?.type !== "diagram") {
            throw new Error(`No diagram analysis with ID ${id}`);
        }
        return this.loadAnalysis(plugin);
    }

    private loadAnalysis(plugin: ModelAnalysisPlugin): Promise<ModelAnalysisBuilder<unknown>>;
    private loadAnalysis(plugin: DiagramAnalysisPlugin): Promise<DiagramAnalysisBuilder<unknown>>;
    private loadAnalysis(plugin: AnalysisPlugin): Promise<AnalysisBuilder<unknown>>;
    private async loadAnalysis(plugin: AnalysisPlugin) {
        let builder = this.analysisBuilders.get(plugin.id);
        if (!builder) {
            builder = await plugin.load(plugin);
            this.analysisBuilders.set(plugin.id, builder);
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
