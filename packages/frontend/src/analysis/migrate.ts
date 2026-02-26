import type { Analysis, Notebook } from "catlog-wasm";
import { NotebookUtils } from "../notebook/types";
import type { AnalysisMeta } from "../theory";

/** Migrate content of formal cells in an analysis notebook.
 *
 * This is a stop-gap (read: hacky) method to migrate the content of analyses when
 * the set of fields changes. It allows new fields to be added. Renaming or removing
 * existing fields is *not* supported.
 *
 * Fills in missing fields from analysis defaults. Mutates the notebook in place.
 */
export function migrateAnalysisContent<T extends Analysis>(
    notebook: Notebook<T>,
    getAnalysisMeta: (analysisId: string) => AnalysisMeta<unknown> | undefined,
): void {
    for (const cell of NotebookUtils.getFormalCells(notebook)) {
        // TypeScript doesn't narrow the discriminated union type properly in this generic context,
        // so we assert that cell.content is T (which is Analysis<unknown>).
        const analysis = cell.content as T;
        const meta = getAnalysisMeta(analysis.id);
        if (!meta) {
            continue;
        }
        const initialContent = meta.initialContent() as Record<string, unknown>;
        const cellContent = analysis.content as Record<string, unknown>;
        for (const key in initialContent) {
            if (!(key in cellContent)) {
                cellContent[key] = initialContent[key];
            }
        }
    }
}
