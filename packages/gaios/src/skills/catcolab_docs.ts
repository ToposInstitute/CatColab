import type { AutomergeUrl, DocHandle } from "@automerge/automerge-repo";

import { stdTheories } from "../../../frontend/src/stdlib";
import type { Theory } from "../../../frontend/src/theory";
import type { AnalysisDoc } from "../analysis_datatype";
import type { ModelDoc } from "../model_datatype";
import type { LlmSkillToolCtx } from "./skill_types";

/** A model and the analysis paired with it, found from either one. */
export type CatColabDocs = {
    model: DocHandle<ModelDoc>;
    analysis: DocHandle<AnalysisDoc> | undefined;
};

/** Finds the model and its analysis from the URL of either document, or from
the focused document when no URL is given.
 */
export async function findCatColabDocs(ctx: LlmSkillToolCtx, url: unknown): Promise<CatColabDocs> {
    const target = typeof url === "string" && url ? url : ctx.focusedUrl;
    if (!target) {
        throw new Error("No document is focused; pass the url of a CatColab model or analysis.");
    }
    const handle = await ctx.repo.find<ModelDoc | AnalysisDoc>(target as AutomergeUrl);
    const doc = handle.doc();

    if (doc.type === "model") {
        const model = handle as DocHandle<ModelDoc>;
        const analysisUrl = model.doc().analysisDocUrl;
        const analysis = analysisUrl ? await ctx.repo.find<AnalysisDoc>(analysisUrl) : undefined;
        return { model, analysis };
    }
    if (doc.type === "analysis") {
        const analysis = handle as DocHandle<AnalysisDoc>;
        const modelUrl = analysis.doc().analysisOf?._id;
        if (doc.analysisType !== "model" || !modelUrl) {
            throw new Error(`${target} is not an analysis of a model.`);
        }
        const model = await ctx.repo.find<ModelDoc>(modelUrl as AutomergeUrl);
        return { model, analysis };
    }
    throw new Error(`${target} is not a CatColab model or analysis.`);
}

/** Loads a theory by ID, or `undefined` if the library doesn't have it. */
export async function loadTheory(id: string): Promise<Theory | undefined> {
    return stdTheories.has(id) ? stdTheories.get(id) : undefined;
}

/** One line per theory in the standard library, for skill instructions. */
export function theoryList(): string {
    return [...stdTheories.allMetadata()]
        .filter((meta) => meta.id !== "empty")
        .map((meta) => `- \`${meta.id}\`: ${meta.name} — ${meta.description}`)
        .join("\n");
}

/** Reads an optional string argument. */
export function stringArg(args: unknown, key: string): string | undefined {
    const value = isRecord(args) ? args[key] : undefined;
    return typeof value === "string" && value ? value : undefined;
}

/** Reads an optional array argument. */
export function arrayArg<T>(args: unknown, key: string): T[] {
    const value = isRecord(args) ? args[key] : undefined;
    return Array.isArray(value) ? (value as T[]) : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}
