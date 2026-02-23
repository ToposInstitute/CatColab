import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

import { migrateDocument, validateAnalysisContent } from "catlog-wasm";

/** Path to a JSON file containing an array of analysis documents.
 * Set via the ANALYSIS_FIXTURES_PATH environment variable.
 * If not set, the test suite will be skipped.
 */
const fixturesPath = process.env.ANALYSIS_FIXTURES_PATH;

describe("Staging document backward compatibility", () => {
    // Load fixtures from the file path (if set)
    const allFixtures: unknown[] = fixturesPath
        ? JSON.parse(readFileSync(fixturesPath, "utf-8"))
        : [];

    // Filter out corrupted documents that are missing the analysisType field.
    // These are genuinely broken documents that cannot be migrated without
    // manually determining whether they're model or diagram analyses.
    // There are ~6 such documents in staging as of 2025-02-23.
    const fixtures = allFixtures.filter((doc) => {
        const d = doc as Record<string, unknown>;
        return d.analysisType !== undefined;
    });

    // Skip the entire suite if no fixtures are available
    test.skipIf(!fixturesPath)("fixtures should be loaded", () => {
        expect(fixtures.length).toBeGreaterThan(0);
    });

    // Run tests for each document
    for (let i = 0; i < fixtures.length; i++) {
        const doc = fixtures[i] as Record<string, unknown>;
        const docName = (doc.name as string | undefined) ?? "unnamed";

        describe(`document ${i}: ${docName}`, () => {
            test("migrateDocument succeeds", () => {
                expect(() => migrateDocument(doc)).not.toThrow();
            });

            test("all analysis cells deserialize through WASM", () => {
                // Migrate the document first (tests document-level migration)
                const migrated = migrateDocument(doc) as Record<string, unknown>;
                const notebook = migrated.notebook as {
                    cellContents: Record<
                        string,
                        {
                            tag: string;
                            content?: { id: string; content: unknown };
                        }
                    >;
                };

                // For each formal (analysis) cell, validate its content
                for (const [cellId, cell] of Object.entries(notebook.cellContents)) {
                    if (cell.tag === "formal" && cell.content) {
                        const analysis = cell.content;

                        // This calls the WASM validateAnalysisContent function,
                        // which tests the same serde deserialization path that
                        // would be used at runtime. If this throws, it means
                        // the content is incompatible with the current Rust struct.
                        expect(
                            () => validateAnalysisContent(analysis.id, analysis.content),
                            `Cell ${cellId} (analysis "${analysis.id}") should deserialize without errors`,
                        ).not.toThrow();
                    }
                }
            });
        });
    }
});
