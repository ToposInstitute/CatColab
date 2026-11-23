import type { AnalysisType } from "catcolab-document-types";
import type { Doctrine } from "catlog-wasm";
import type { AnalysisBuilder, DiagramAnalysisBuilder, ModelAnalysisBuilder } from "../analysis";
import type {
    AnalysisManifest,
    AnalysisContribution,
    DiagramAnalysisContribution,
    ModelAnalysisContribution,
} from "./analysis";
import type { Plugin } from "./types";

/** Registry of plugins. */
export class PluginRegistry {
    private readonly contributions: Map<string, ResolvedAnalysisContribution>;

    /** Loaded analysis builders, keyed by contribution ID. */
    private readonly analysisBuilders: Map<string, AnalysisBuilder<unknown>>;

    constructor() {
        this.contributions = new Map();
        this.analysisBuilders = new Map();
    }

    /** Adds a plugin to the registry. */
    add(plugin: Plugin) {
        validateName(plugin.namespace, "Plugin namespace");
        validateName(plugin.name, "Plugin name");
        const prefix = `${plugin.namespace}/${plugin.name}`;

        for (const contribution of plugin.contributions) {
            validateName(contribution.name, `Contribution name in plugin ${prefix}`);
            const id = `${prefix}/${contribution.name}`;

            if (this.contributions.has(id)) {
                throw new Error(`Contribution with ID ${id} already exists`);
            }
            this.contributions.set(id, { id, ...contribution });
        }
    }

    /** Gets the analyses available for a model. */
    modelAnalyses(key: ScopeKey): ResolvedAnalysisManifest[] {
        return this.analyses("model", key);
    }

    /** Gets the analyses available for a diagram. */
    diagramAnalyses(key: ScopeKey): ResolvedAnalysisManifest[] {
        return this.analyses("diagram", key);
    }

    /** Gets the analyses of the given type available for an entity. */
    analyses(type: AnalysisType, key: ScopeKey): ResolvedAnalysisManifest[] {
        const manifests: ResolvedAnalysisManifest[] = [];
        for (const contribution of this.contributions.values()) {
            if (contribution.analysisType === type && isKeyInScope(contribution, key)) {
                manifests.push(contribution);
            }
        }
        return manifests;
    }

    /** Gets the manifest for an analysis, if it exists. */
    analysisManifest(id: string): ResolvedAnalysisManifest | undefined {
        return this.contributions.get(id);
    }

    /** Gets the builder for an analysis of any type, loading it if necessary. */
    async analysisBuilder(id: string): Promise<AnalysisBuilder<unknown>> {
        const contribution = this.contributions.get(id);
        if (!contribution) {
            throw new Error(`No analysis with ID ${id}`);
        }
        return this.load(contribution);
    }

    /** Gets the builder for a model analysis, loading it if necessary. */
    async modelAnalysisBuilder(id: string): Promise<ModelAnalysisBuilder<unknown>> {
        const contribution = this.contributions.get(id);
        if (contribution?.analysisType !== "model") {
            throw new Error(`No model analysis with ID ${id}`);
        }
        return this.load(contribution);
    }

    /** Gets the builder for a diagram analysis, loading it if necessary. */
    async diagramAnalysisBuilder(id: string): Promise<DiagramAnalysisBuilder<unknown>> {
        const contribution = this.contributions.get(id);
        if (contribution?.analysisType !== "diagram") {
            throw new Error(`No diagram analysis with ID ${id}`);
        }
        return this.load(contribution);
    }

    private load(
        contribution: ResolvedID & ModelAnalysisContribution,
    ): Promise<ModelAnalysisBuilder<unknown>>;
    private load(
        contribution: ResolvedID & DiagramAnalysisContribution,
    ): Promise<DiagramAnalysisBuilder<unknown>>;
    private load(contribution: ResolvedAnalysisContribution): Promise<AnalysisBuilder<unknown>>;
    private async load(contribution: ResolvedAnalysisContribution) {
        let builder = this.analysisBuilders.get(contribution.id);
        if (!builder) {
            builder = await contribution.load(contribution);
            this.analysisBuilders.set(contribution.id, builder);
        }
        return builder;
    }
}

type ResolvedID = {
    /** Globally unique identifier of a contribution.

    Has the form `{namespace}/{plugin name}/{contribution name}`.
     */
    id: string;
};

/** Manifest for an analysis, with its globally unique ID. */
export type ResolvedAnalysisManifest = ResolvedID & AnalysisManifest;
type ResolvedAnalysisContribution = ResolvedID & AnalysisContribution;

type ScopeKey = {
    doctrine: Doctrine;
    theory: string;
};

/** Does the key satisfy all the constraints in the manifest's scope? */
function isKeyInScope(manifest: AnalysisManifest, key: ScopeKey): boolean {
    const { doctrine, theory, model } = manifest.scope;
    if (model !== undefined) {
        throw new Error("`model` scope is not implemented");
    }
    return (
        (doctrine === undefined || doctrine.includes(key.doctrine)) &&
        (theory === undefined || theory.includes(key.theory))
    );
}

/** Throws if the name is empty or contains whitespace or a slash. */
function validateName(name: string, description: string) {
    if (!name || /[\s/]/.test(name)) {
        throw new Error(`${description} must be nonempty without whitespace or slash: "${name}"`);
    }
}
