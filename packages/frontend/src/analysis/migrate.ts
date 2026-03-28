import type { Analysis, AnalysisType, Notebook } from "catlog-wasm";
import { NotebookUtils } from "../notebook/types";
import type { AnalysisMeta, Theory } from "../theory";

/** Migrate content of formal cells in an analysis notebook.
 *
 * This is a stop-gap (read: hacky) method to migrate the content of analyses when
 * the set of fields changes. It allows new fields to be added. Renaming or removing
 * existing fields is *not* supported.
 *
 * Fills in missing fields from analysis defaults. Mutates the notebook in place.
 */
export function migrateAnalysis<T extends Analysis>(
    notebook: Notebook<T>,
    theory: Theory,
    analysisType: AnalysisType,
): void {
    for (const cell of NotebookUtils.getFormalCells(notebook)) {
        const analysis = cell.content;
        let meta: AnalysisMeta<unknown> | undefined;
        switch (analysisType) {
            case "model":
                meta = theory.modelAnalysis(analysis.id);
                break;
            case "diagram":
                meta = theory.diagramAnalysis(analysis.id);
                break;
        }
        if (!meta) {
            continue;
        }
        const initialContent = meta.initialContent() as Record<string, unknown>;
        const cellContent = analysis.content;
        for (const key in initialContent) {
            if (!(key in cellContent)) {
                cellContent[key] = initialContent[key];
            }
        }
    }
}
