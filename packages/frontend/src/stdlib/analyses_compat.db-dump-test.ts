import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

import { migrateDocument, validateAnalysisContent } from "catlog-wasm";

/** Path to a JSON file containing an array of analysis documents.
 * Set via the ANALYSIS_FIXTURES_PATH environment variable.
 * If not set, the test suite will be skipped.
 */
const fixturesPath = process.env.ANALYSIS_FIXTURES_PATH;

describe("Database dump backward compatibility", () => {
    // Load fixtures from the file path (if set)
    const allFixtures: unknown[] = fixturesPath
        ? JSON.parse(readFileSync(fixturesPath, "utf-8"))
        : [];

    // Filter out corrupted documents that are missing the analysisType field.
    // These are genuinely broken documents that cannot be migrated without
    // manually determining whether they're model or diagram analyses.
    const fixtures = allFixtures.filter((doc) => {
        const d = doc as Record<string, unknown>;
        return d.analysisType !== undefined;
    });

    // Skip the entire suite if no fixtures are available
    test.skipIf(!fixturesPath)("fixtures should be loaded", () => {
        expect(fixtures.length).toBeGreaterThan(0);
    });

    // Run one test per document: migrate, then validate all analysis cells.
    for (let i = 0; i < fixtures.length; i++) {
        const doc = fixtures[i] as Record<string, unknown>;
        const docName = (doc.name as string | undefined) ?? "unnamed";
        const analysisType = (doc.analysisType as string | undefined) ?? "unknown";

        test.skipIf(!fixturesPath)(`document ${i}: "${docName}" (type: ${analysisType})`, () => {
            // Step 1: Migrate the document. If this fails, report and stop.
            let migrated: Record<string, unknown>;
            try {
                migrated = migrateDocument(doc) as Record<string, unknown>;
            } catch (e) {
                expect.fail(
                    `migrateDocument failed: ${e instanceof Error ? e.message : String(e)}`,
                );
            }

            // Step 2: Validate each formal (analysis) cell through WASM.
            const notebook = migrated.notebook as {
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
                const analysis = cell.content;
                try {
                    validateAnalysisContent(analysis.id, analysis.content);
                } catch (e) {
                    const msg = e instanceof Error ? e.message : String(e);
                    failures.push(`  cell ${cellId} (${analysis.id}): ${msg}`);
                }
            }

            if (failures.length > 0) {
                expect.fail(
                    `${failures.length} of ${cellCount} analysis cells failed deserialization:\n${failures.join("\n")}`,
                );
            }
        });
    }
});
