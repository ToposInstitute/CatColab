import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

import { DblModelMap, elaborateModel, migrateDocument } from "catlog-wasm";
import { stdTheories } from "./theories";

/** Path to a JSON file containing analysis documents and their referenced models.
 * Set via the NOTEBOOK_FIXTURES_PATH environment variable.
 * This path is required — the test will fail if not set.
 */
const fixturesPath = process.env.NOTEBOOK_FIXTURES_PATH;

describe("Database dump backward compatibility", () => {
    // Fail immediately if fixtures path is not provided
    test("NOTEBOOK_FIXTURES_PATH must be set", () => {
        if (!fixturesPath) {
            expect.fail(
                "NOTEBOOK_FIXTURES_PATH environment variable is not set. " +
                    "This test requires a JSON file with analysis documents and models.",
            );
        }
        expect(fixturesPath).toBeTruthy();
    });

    // Load fixtures from the file path
    const allData: { analyses?: unknown[]; models?: unknown[] } = fixturesPath
        ? JSON.parse(readFileSync(fixturesPath, "utf-8"))
        : {};

    const allAnalyses = allData.analyses ?? [];
    const allModels = allData.models ?? [];

    // Filter out corrupted analysis documents that are missing the analysisType field.
    // These are genuinely broken documents that cannot be migrated without
    // manually determining whether they're model or diagram analyses.
    const analyses = allAnalyses.filter((doc) => {
        const d = doc as Record<string, unknown>;
        return d.analysisType !== undefined;
    });

    // Separate model analyses from diagram analyses.
    // Only model analyses can be tested because we dump model documents, not diagrams.
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
        if (!refId) continue;

        try {
            const migrated = migrateDocument(doc) as Record<string, unknown>;
            modelById.set(refId, migrated);
        } catch (_e) {
            // Model migration failed — will be reported when a test references it.
        }
    }

    test("fixtures should be loaded", () => {
        expect(analyses.length).toBeGreaterThan(0);
    });

    // Report diagram analyses that are excluded from testing.
    if (diagramAnalyses.length > 0) {
        test(`${diagramAnalyses.length} diagram analyses excluded (diagram testing not yet supported)`, () => {
            // This test passes — it documents that diagram analyses exist but aren't tested.
            // Diagram analyses reference diagram documents, not model documents, and require
            // colimit computation infrastructure that this test suite doesn't provide.
            expect(diagramAnalyses.length).toBeGreaterThan(0);
        });
    }

    // Run one test per model analysis document: migrate, compile model, and run analysis functions.
    for (let i = 0; i < modelAnalyses.length; i++) {
        const doc = modelAnalyses[i] as Record<string, unknown>;
        const docName = (doc.name as string | undefined) ?? "unnamed";

        test(`model analysis ${i}: "${docName}"`, async () => {
            // Step 1: Migrate the analysis document
            let migratedAnalysis: Record<string, unknown>;
            try {
                migratedAnalysis = migrateDocument(doc) as Record<string, unknown>;
            } catch (e) {
                expect.fail(
                    `migrateDocument failed: ${e instanceof Error ? e.message : String(e)}`,
                );
            }

            // Step 2: Get the referenced model
            const analysisOf = migratedAnalysis.analysisOf as { _id?: string } | undefined;
            const modelRefId = analysisOf?._id;
            if (!modelRefId) {
                expect.fail("Analysis is missing analysisOf._id");
            }

            const migratedModel = modelById.get(modelRefId);
            if (!migratedModel) {
                expect.fail(`Referenced model ${modelRefId} not found in dump`);
            }

            // Step 3: Get the theory and compile the model
            const theoryId = migratedModel.theory as string;
            const theory = await stdTheories.get(theoryId);

            const instantiated = new DblModelMap();
            const compiledModel = elaborateModel(
                migratedModel.notebook,
                instantiated,
                theory.theory,
                modelRefId,
            );

            // Step 4: Run each analysis cell through the real WASM functions
            const notebook = migratedAnalysis.notebook as {
                cellContents: Record<
                    string,
                    {
                        tag: string;
                        content?: { id: string; content: unknown };
                    }
                >;
            };

            const failures: string[] = [];
            let cellCount = 0;

            for (const [cellId, cell] of Object.entries(notebook.cellContents)) {
                if (cell.tag !== "formal" || !cell.content) {
                    continue;
                }
                cellCount++;
                const analysisCell = cell.content;
                const analysisId = analysisCell.id;

                // Look up the analysis function from the theory
                const analysisSpec = theory.modelAnalysis(analysisId);
                if (!analysisSpec) {
                    failures.push(
                        `  cell ${cellId} (${analysisId}): analysis not found in theory ${theoryId}`,
                    );
                    continue;
                }

                if (!analysisSpec.run) {
                    // Analysis type has no run function (e.g., visualization-only).
                    // These don't deserialize content through WASM, so nothing to test.
                    continue;
                }

                try {
                    analysisSpec.run(compiledModel, analysisCell.content);
                } catch (e) {
                    const msg = e instanceof Error ? e.message : String(e);
                    failures.push(`  cell ${cellId} (${analysisId}): ${msg}`);
                }
            }

            if (failures.length > 0) {
                expect.fail(
                    `${failures.length} of ${cellCount} analysis cells failed:\n${failures.join("\n")}`,
                );
            }
        });
    }
});
