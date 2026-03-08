import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

import {
    type Analysis,
    DblModelMap,
    type DiagramJudgment,
    type DiagramNotebook,
    elaborateDiagram,
    elaborateModel,
    type ModelNotebook,
    migrateDocument,
    type Notebook,
} from "catlog-wasm";
import { migrateAnalysis } from "../analysis/migrate";
import { NotebookUtils } from "../notebook/types";
import { stdTheories } from "./theories";

/** Path to a JSON file containing analysis documents and their referenced
 * models and diagrams. Set via the NOTEBOOK_FIXTURES_PATH environment variable.
 * This path is required — the test will fail if not set.
 * You can create the JSON using infrastructure/scripts/dump-notebook-fixtures.
 */
const fixturesPath = process.env.NOTEBOOK_FIXTURES_PATH;

/** Path to a CSV file containing UUIDs of analysis documents to skip.
 * The first line is a header and is ignored. Each subsequent line starts
 * with the UUID. The rest of the columns are ignored. Set via the
 * NOTEBOOK_SKIPLIST_PATH environment variable. This path is required — the
 * test will fail if not set.
 */
const skiplistPath = process.env.NOTEBOOK_SKIPLIST_PATH;

const skippedIds: Set<string> = (() => {
    if (!skiplistPath) {
        return new Set<string>();
    }
    const content = readFileSync(skiplistPath, "utf-8");
    const set = new Set<string>();
    const lines = content.split("\n");
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i]?.trim();
        if (!line || line.length === 0) {
            continue;
        }
        const commaIdx = line.indexOf(",");
        set.add(commaIdx === -1 ? line : line.slice(0, commaIdx).trim());
    }
    return set;
})();

describe("Database dump backward compatibility", () => {
    // Fail immediately if required environment variables are not provided
    test("NOTEBOOK_FIXTURES_PATH must be set", () => {
        if (!fixturesPath) {
            expect.fail(
                "NOTEBOOK_FIXTURES_PATH environment variable is not set. " +
                    "This test requires a JSON file with analysis documents, models, and diagrams.",
            );
        }
        expect(fixturesPath).toBeTruthy();
    });

    test("NOTEBOOK_SKIPLIST_PATH must be set", () => {
        if (!skiplistPath) {
            expect.fail(
                "NOTEBOOK_SKIPLIST_PATH environment variable is not set. " +
                    "This test requires a CSV file with UUIDs of analysis documents to skip.",
            );
        }
        expect(skiplistPath).toBeTruthy();
    });

    // Load fixtures from the file path
    const allData: { analyses?: unknown[]; models?: unknown[]; diagrams?: unknown[] } = fixturesPath
        ? JSON.parse(readFileSync(fixturesPath, "utf-8"))
        : {};

    const allAnalyses = allData.analyses ?? [];
    const allModels = allData.models ?? [];
    const allDiagrams = allData.diagrams ?? [];

    // Filter out corrupted analysis documents that are missing the analysisType field.
    // These are genuinely broken documents that cannot be migrated without
    // manually determining whether they're model or diagram analyses.
    const analyses = allAnalyses.filter((doc) => {
        const d = doc as Record<string, unknown>;
        return d.analysisType !== undefined;
    });

    // Separate model analyses from diagram analyses.
    const modelAnalyses = analyses.filter(
        (doc) => (doc as Record<string, unknown>).analysisType === "model",
    );
    const diagramAnalyses = analyses.filter(
        (doc) => (doc as Record<string, unknown>).analysisType === "diagram",
    );

    // Build a map of model ID -> migrated model document
    const modelById = new Map<string, Record<string, unknown>>();
    for (const modelDoc of allModels) {
        const doc = modelDoc as Record<string, unknown>;
        const refId = doc._refId as string | undefined;
        if (!refId) {
            continue;
        }

        const migrated = migrateDocument(doc) as Record<string, unknown>;
        modelById.set(refId, migrated);
    }

    // Build a map of diagram ID -> migrated diagram document
    const diagramById = new Map<string, Record<string, unknown>>();
    for (const diagramDoc of allDiagrams) {
        const doc = diagramDoc as Record<string, unknown>;
        const refId = doc._refId as string | undefined;
        if (!refId) {
            continue;
        }

        const migrated = migrateDocument(doc) as Record<string, unknown>;
        diagramById.set(refId, migrated);
    }

    test("fixtures should be loaded", () => {
        expect(analyses.length).toBeGreaterThan(0);
    });

    // Run one test per model analysis document: migrate, compile model, and run analysis functions.
    for (let i = 0; i < modelAnalyses.length; i++) {
        const doc = modelAnalyses[i] as Record<string, unknown>;
        const docName = (doc.name as string | undefined) ?? "unnamed";
        const docRefId = (doc._refId as string | undefined) ?? "no-ref-id";

        // Skip known-failing analysis documents.
        if (skippedIds.has(docRefId)) {
            test.skip(`model analysis ${i}: "${docName}" [${docRefId}] (skiplisted)`, () => {});
            continue;
        }

        test(`model analysis ${i}: "${docName}" [${docRefId}]`, async () => {
            // Step 1: Migrate the analysis document
            const migratedAnalysis = migrateDocument(doc) as Record<string, unknown>;

            // Step 2: Get the referenced model
            const analysisOf = migratedAnalysis.analysisOf as { _id?: string } | undefined;
            const modelRefId = analysisOf?._id;
            if (!modelRefId) {
                expect.fail(`analysis: ${docRefId} | Analysis is missing analysisOf._id`);
            }

            const migratedModel = modelById.get(modelRefId);
            if (!migratedModel) {
                // Model may have been deleted while the analysis still references it.
                return;
            }

            // Step 3: Get the theory and compile the model
            const theoryId = migratedModel.theory as string;
            const theory = await stdTheories.get(theoryId);

            const instantiated = new DblModelMap();
            const compiledModel = elaborateModel(
                migratedModel.notebook as ModelNotebook,
                instantiated,
                theory.theory,
                modelRefId,
            );

            // Step 3.5: Migrate analysis content — fill in missing fields from defaults.
            // This uses the same function as the real app (migrateAnalysis).
            migrateAnalysis(migratedAnalysis.notebook as Notebook<Analysis>, theory, "model");

            // Step 4: Run each analysis cell through the real WASM functions
            runAnalysisCells(
                migratedAnalysis,
                (id) => theory.modelAnalysis(id),
                (spec, content) => spec.run?.(compiledModel, content),
                theoryId,
            );
        });
    }

    // Run one test per diagram analysis document: migrate, compile diagram + model, and run
    // analysis functions.
    for (let i = 0; i < diagramAnalyses.length; i++) {
        const doc = diagramAnalyses[i] as Record<string, unknown>;
        const docName = (doc.name as string | undefined) ?? "unnamed";
        const docRefId = (doc._refId as string | undefined) ?? "no-ref-id";

        // Skip known-failing analysis documents.
        if (skippedIds.has(docRefId)) {
            test.skip(`diagram analysis ${i}: "${docName}" [${docRefId}] (skiplisted)`, () => {});
            continue;
        }

        test(`diagram analysis ${i}: "${docName}" [${docRefId}]`, async () => {
            // Step 1: Migrate the analysis document
            const migratedAnalysis = migrateDocument(doc) as Record<string, unknown>;

            // Step 2: Get the referenced diagram
            const analysisOf = migratedAnalysis.analysisOf as { _id?: string } | undefined;
            const diagramRefId = analysisOf?._id;
            if (!diagramRefId) {
                expect.fail(`analysis: ${docRefId} | Analysis is missing analysisOf._id`);
            }

            const migratedDiagram = diagramById.get(diagramRefId);
            if (!migratedDiagram) {
                // Diagram may have been deleted while the analysis still references it.
                return;
            }

            // Step 3: Get the parent model referenced by the diagram
            const diagramIn = migratedDiagram.diagramIn as { _id?: string } | undefined;
            const modelRefId = diagramIn?._id;
            if (!modelRefId) {
                expect.fail(
                    `analysis: ${docRefId} | Diagram ${diagramRefId} is missing diagramIn._id`,
                );
            }

            const migratedModel = modelById.get(modelRefId);
            if (!migratedModel) {
                // Parent model may have been deleted.
                return;
            }

            // Step 4: Get the theory, compile the model, and elaborate the diagram
            const theoryId = migratedModel.theory as string;
            const theory = await stdTheories.get(theoryId);

            const instantiated = new DblModelMap();
            const compiledModel = elaborateModel(
                migratedModel.notebook as ModelNotebook,
                instantiated,
                theory.theory,
                modelRefId,
            );

            // Validate the model before elaborating the diagram
            const modelValidation = compiledModel.validate();
            if (modelValidation.tag !== "Ok") {
                // Model is invalid — diagram cannot be validated against it.
                // This is not a backward compatibility failure in the analysis.
                return;
            }

            const diagramJudgments: DiagramJudgment[] = NotebookUtils.getFormalContent(
                migratedDiagram.notebook as DiagramNotebook,
            );

            const compiledDiagram = elaborateDiagram(diagramJudgments, theory.theory);

            compiledDiagram.inferMissingFrom(compiledModel);

            // Step 4.5: Migrate analysis content — fill in missing fields from defaults.
            migrateAnalysis(migratedAnalysis.notebook as Notebook<Analysis>, theory, "diagram");

            // Step 5: Run each analysis cell through the real WASM functions
            runAnalysisCells(
                migratedAnalysis,
                (id) => theory.diagramAnalysis(id),
                (spec, content) => spec.run?.(compiledDiagram, compiledModel, content),
                theoryId,
            );
        });
    }
});

/** Run all formal analysis cells in a migrated analysis document.
 *
 * Throws immediately on any failure.
 */
function runAnalysisCells(
    migratedAnalysis: Record<string, unknown>,
    // biome-ignore lint/suspicious/noExplicitAny: run signatures differ between model and diagram analyses.
    getAnalysisSpec: (id: string) => { run?: (...args: any[]) => unknown } | undefined,
    // biome-ignore lint/suspicious/noExplicitAny: run signatures differ between model and diagram analyses.
    runSpec: (spec: { run?: (...args: any[]) => unknown }, content: unknown) => unknown,
    theoryId: string,
): void {
    const notebook = migratedAnalysis.notebook as {
        cellContents: Record<
            string,
            {
                tag: string;
                content?: { id: string; content: unknown };
            }
        >;
    };

    for (const [cellId, cell] of Object.entries(notebook.cellContents)) {
        if (cell.tag !== "formal" || !cell.content) {
            continue;
        }
        const analysisCell = cell.content;
        const analysisId = analysisCell.id;

        // Look up the analysis spec from the theory
        const analysisSpec = getAnalysisSpec(analysisId);
        if (!analysisSpec) {
            throw new Error(
                `cell ${cellId} | analysis: ${analysisId} | theory: ${theoryId} | Analysis not found in theory`,
            );
        }

        if (!analysisSpec.run) {
            // Analysis type has no run function (e.g., visualization-only).
            // These don't deserialize content through WASM, so nothing to test.
            continue;
        }

        runSpec(analysisSpec, analysisCell.content);
    }
}
