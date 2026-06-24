import type { Analysis, AnalysisType, Document, Link } from "catcolab-document-types";
import { currentVersion } from "catcolab-document-types";
import { newNotebook } from "../notebook";

/** A document defining an analysis notebook over another document. */
export type AnalysisDocument = Document & { type: "analysis" };

/** Create an empty analysis document. */
export const newAnalysisDocument = (args: {
    analysisType: AnalysisType;
    analysisOf: Link;
    name?: string;
}): AnalysisDocument => ({
    type: "analysis",
    name: args.name ?? "",
    analysisType: args.analysisType,
    analysisOf: args.analysisOf,
    notebook: newNotebook<Analysis>(),
    version: currentVersion(),
});

/** Create a new analysis cell with the given id and initial content. */
export const newAnalysisCell = (id: string, content: Record<string, unknown>): Analysis => ({
    id,
    content,
});
