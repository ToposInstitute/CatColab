import { readFileSync } from "node:fs";
import { PetriNet } from "catcolab-logics/petri-net";
import { SimpleOlog } from "catcolab-logics/simple-olog";
import { SimpleSchema } from "catcolab-logics/simple-schema";
import fc from "fast-check";
import { describe, expect, test } from "vitest";

import { migrateDocument, type Document } from "catcolab-document-types";
import {
    createBinder,
    type DocumentStore,
    type Notebook,
    RichText,
    type ValidatableNotebook,
} from "catcolab-documents";
import { assertNotebookStructureIsConsistent } from "../helpers/notebook_invariants";

const shapeByTheory = {
    "petri-net": PetriNet,
    "simple-olog": SimpleOlog,
    "simple-schema": SimpleSchema,
} as const;

type SupportedShape = (typeof shapeByTheory)[keyof typeof shapeByTheory];
type CorpusNotebook = Notebook<SupportedShape> & ValidatableNotebook;
type CorpusTransaction = ReturnType<CorpusNotebook["beginTransaction"]>;
type ModelDocument = Extract<Document, { type: "model" }>;

type Edit =
    | { kind: "add-rich-text"; content: string }
    | { kind: "delete"; target: number }
    | { kind: "duplicate"; target: number }
    | { kind: "move-down"; target: number }
    | { kind: "move-to"; target: number; destination: number }
    | { kind: "move-up"; target: number };

type SemanticPreservingEdit =
    | { kind: "add-rich-text"; content: string }
    | { kind: "move-down"; target: number }
    | { kind: "move-to"; target: number; destination: number }
    | { kind: "move-up"; target: number };

const editArbitrary: fc.Arbitrary<Edit> = fc.oneof(
    fc.record({ kind: fc.constant("add-rich-text"), content: fc.string() }),
    fc.record({ kind: fc.constant("delete"), target: fc.nat() }),
    fc.record({ kind: fc.constant("duplicate"), target: fc.nat() }),
    fc.record({ kind: fc.constant("move-down"), target: fc.nat() }),
    fc.record({
        kind: fc.constant("move-to"),
        target: fc.nat(),
        destination: fc.integer(),
    }),
    fc.record({ kind: fc.constant("move-up"), target: fc.nat() }),
);

const editProgramArbitrary = fc.array(editArbitrary, { minLength: 1, maxLength: 25 });

const semanticPreservingEditArbitrary: fc.Arbitrary<SemanticPreservingEdit> = fc.oneof(
    fc.record({ kind: fc.constant("add-rich-text"), content: fc.string() }),
    fc.record({ kind: fc.constant("move-down"), target: fc.nat() }),
    fc.record({
        kind: fc.constant("move-to"),
        target: fc.nat(),
        destination: fc.integer(),
    }),
    fc.record({ kind: fc.constant("move-up"), target: fc.nat() }),
);

const semanticPreservingProgramArbitrary = fc.array(semanticPreservingEditArbitrary, {
    minLength: 1,
    maxLength: 25,
});

type FixtureRecord = {
    readonly refId: string;
    readonly document: ModelDocument;
};

type Corpus = {
    readonly server: string;
    readonly records: ReadonlyMap<string, FixtureRecord>;
    readonly candidates: readonly FixtureRecord[];
    readonly migrationFailures: number;
    readonly total: number;
};

type FixtureHandle = {
    readonly refId: string;
    readonly listeners: Set<() => void>;
    document: Document;
};

function notify(handle: FixtureHandle): void {
    for (const listener of handle.listeners) {
        listener();
    }
}

describe("editing valid models from a Next database dump", () => {
    test("arbitrary transactional edits preserve structure and revert exactly", async () => {
        const fixturePath = process.env["NOTEBOOK_FIXTURES_PATH"];
        if (!fixturePath) {
            throw new Error("NOTEBOOK_FIXTURES_PATH must point to a Next model fixture.");
        }

        const corpus = loadCorpus(fixturePath);
        const limit = readPositiveInteger("DOCUMENT_CORPUS_LIMIT") ?? corpus.candidates.length;
        const numRuns = readPositiveInteger("DOCUMENT_CORPUS_RUNS") ?? 3;
        const candidates = corpus.candidates.slice(0, limit);
        const candidateTheories = new Set(candidates.map(({ document }) => document.theory));
        const validByTheory = new Map<string, number>();

        let valid = 0;
        let loadFailures = 0;
        let structurallyInvalid = 0;
        let semanticallyInvalid = 0;

        for (const candidate of candidates) {
            const opened = await openFixture(corpus, candidate);
            if (opened.tag === "Err") {
                loadFailures += 1;
                continue;
            }

            try {
                assertNotebookStructureIsConsistent(opened.notebook);
            } catch {
                structurallyInvalid += 1;
                continue;
            }

            if ((await opened.notebook.validate()).tag !== "Ok") {
                semanticallyInvalid += 1;
                continue;
            }

            valid += 1;
            validByTheory.set(
                candidate.document.theory,
                (validByTheory.get(candidate.document.theory) ?? 0) + 1,
            );
            await checkFixture(corpus, candidate, numRuns);
        }

        console.info("Next model corpus summary", {
            candidates: candidates.length,
            loadFailures,
            migrationFailures: corpus.migrationFailures,
            semanticallyInvalid,
            structurallyInvalid,
            total: corpus.total,
            valid,
        });
        expect(valid).toBeGreaterThan(0);
        for (const theory of candidateTheories) {
            expect(validByTheory.get(theory) ?? 0).toBeGreaterThan(0);
        }
    });
});

async function checkFixture(
    corpus: Corpus,
    fixture: FixtureRecord,
    numRuns: number,
): Promise<void> {
    try {
        await fc.assert(
            fc.asyncProperty(semanticPreservingProgramArbitrary, async (edits) => {
                const opened = await openFixture(corpus, fixture);
                if (opened.tag === "Err") {
                    throw new Error("A baseline-valid fixture could not be reopened.");
                }

                for (const edit of edits) {
                    applySemanticPreservingEdit(opened.notebook, edit);
                    assertNotebookStructureIsConsistent(opened.notebook);
                    expect((await opened.notebook.validate()).tag).toBe("Ok");
                }
            }),
            { numRuns, seed: seedFromRef(fixture.refId) },
        );

        await fc.assert(
            fc.asyncProperty(editProgramArbitrary, async (edits) => {
                const opened = await openFixture(corpus, fixture);
                if (opened.tag === "Err") {
                    throw new Error("A baseline-valid fixture could not be reopened.");
                }

                const { notebook, storeHarness } = opened;
                assertNotebookStructureIsConsistent(notebook);
                expect((await notebook.validate()).tag).toBe("Ok");

                const baseline = structuredClone(notebook.dump());
                const dependencies = storeHarness.snapshotLoadedExcept(fixture.refId);
                const transaction = notebook.beginTransaction();

                for (const edit of edits) {
                    applyEdit(transaction, edit);
                    assertNotebookStructureIsConsistent(transaction);
                }

                const commit = transaction.commit();
                assertNotebookStructureIsConsistent(notebook);
                expect(["Err", "Ok"]).toContain((await notebook.validate()).tag);

                notebook.revertCommit(commit);
                assertNotebookStructureIsConsistent(notebook);
                expect(notebook.dump()).toEqual(baseline);
                expect((await notebook.validate()).tag).toBe("Ok");
                expect(storeHarness.snapshotLoadedExcept(fixture.refId)).toEqual(dependencies);
            }),
            { numRuns, seed: seedFromRef(fixture.refId) },
        );
    } catch (error) {
        throw new Error(
            `Editing property failed for ref ${fixture.refId}, theory ${fixture.document.theory}.`,
            { cause: error },
        );
    }
}

function applySemanticPreservingEdit(notebook: CorpusNotebook, edit: SemanticPreservingEdit): void {
    if (edit.kind === "add-rich-text") {
        notebook.add(RichText, { content: edit.content });
        return;
    }

    const cells = notebook.cells();
    if (cells.length === 0) {
        return;
    }
    const cell = cells[edit.target % cells.length];
    if (!cell) {
        return;
    }

    switch (edit.kind) {
        case "move-down":
            cell.moveDown();
            break;
        case "move-to":
            cell.moveTo(edit.destination);
            break;
        case "move-up":
            cell.moveUp();
            break;
    }
}

function applyEdit(notebook: CorpusTransaction, edit: Edit): void {
    if (edit.kind === "add-rich-text") {
        notebook.add(RichText, { content: edit.content });
        return;
    }

    const cells = notebook.cells();
    if (cells.length === 0) {
        return;
    }

    const cell = cells[edit.target % cells.length];
    if (!cell) {
        return;
    }

    switch (edit.kind) {
        case "delete":
            cell.delete();
            break;
        case "duplicate":
            if ("duplicate" in cell && typeof cell.duplicate === "function") {
                cell.duplicate();
            }
            break;
        case "move-down":
            cell.moveDown();
            break;
        case "move-to":
            cell.moveTo(edit.destination);
            break;
        case "move-up":
            cell.moveUp();
            break;
    }
}

async function openFixture(
    corpus: Corpus,
    fixture: FixtureRecord,
): Promise<
    { tag: "Ok"; notebook: CorpusNotebook; storeHarness: FixtureStoreHarness } | { tag: "Err" }
> {
    const storeHarness = createFixtureStore(corpus.records, corpus.server);
    const binder = createBinder(storeHarness.store);
    const shape = shapeByTheory[fixture.document.theory as keyof typeof shapeByTheory];
    if (!shape) {
        return { tag: "Err" };
    }

    const loaded = await binder.loadNotebookFromRef(shape, {
        id: fixture.refId,
        server: corpus.server,
        version: null,
    });
    return loaded.tag === "Ok"
        ? { tag: "Ok", notebook: loaded.content as CorpusNotebook, storeHarness }
        : { tag: "Err" };
}

type FixtureStoreHarness = {
    readonly store: DocumentStore<FixtureHandle, Document>;
    snapshotLoadedExcept(refId: string): Map<string, Document>;
};

function createFixtureStore(
    records: ReadonlyMap<string, FixtureRecord>,
    server: string,
): FixtureStoreHarness {
    const handles = new Map<string, FixtureHandle>();
    let createdCount = 0;

    const replaceDocument = (handle: FixtureHandle, document: Document): void => {
        for (const key of Object.keys(handle.document)) {
            delete (handle.document as unknown as Record<string, unknown>)[key];
        }
        Object.assign(handle.document, structuredClone(document));
        notify(handle);
    };

    const getOrCreate = (refId: string): FixtureHandle | undefined => {
        const existing = handles.get(refId);
        if (existing) {
            return existing;
        }
        const fixture = records.get(refId);
        if (!fixture) {
            return undefined;
        }
        const handle = {
            refId,
            listeners: new Set<() => void>(),
            document: structuredClone(fixture.document),
        };
        handles.set(refId, handle);
        return handle;
    };

    return {
        store: {
            createHandle: async (document) => {
                const refId = `fixture-created-${createdCount++}`;
                const handle = {
                    refId,
                    listeners: new Set<() => void>(),
                    document: structuredClone(document as Document),
                };
                handles.set(refId, handle);
                return handle;
            },
            getDocumentView: (handle) => handle.document,
            changeDocument: (handle, change) => {
                change(handle.document);
                notify(handle);
            },
            createDraft: (handle) => {
                const refId = `fixture-draft-${createdCount++}`;
                const draft = {
                    refId,
                    listeners: new Set<() => void>(),
                    document: structuredClone(handle.document),
                };
                handles.set(refId, draft);
                return draft;
            },
            commitDraft: (handle, draft) => {
                const before = structuredClone(handle.document);
                replaceDocument(handle, draft.document);
                return { before, after: structuredClone(handle.document) };
            },
            revertCommit: (handle, commit) => replaceDocument(handle, commit.before),
            subscribe: (handle, callback) => {
                handle.listeners.add(callback);
                return () => {
                    handle.listeners.delete(callback);
                };
            },
            copyValue: (_handle, value) => structuredClone(value),
            getDocumentRef: (handle) => ({ id: handle.refId, server, version: null }),
            getHandle: async (ref) => {
                if ((ref.server && ref.server !== server) || ref.version !== null) {
                    return {
                        tag: "Err",
                        content: [
                            {
                                message: `Unsupported fixture reference ${ref.id}.`,
                                path: ["id"],
                            },
                        ],
                    };
                }
                const handle = getOrCreate(ref.id);
                return handle
                    ? { tag: "Ok", content: handle }
                    : {
                          tag: "Err",
                          content: [
                              {
                                  message: `Cannot resolve fixture reference ${ref.id}.`,
                                  path: ["id"],
                              },
                          ],
                      };
            },
        },
        snapshotLoadedExcept: (refId) =>
            new Map(
                [...handles]
                    .filter(([loadedRefId]) => loadedRefId !== refId && records.has(loadedRefId))
                    .map(([loadedRefId, handle]) => [
                        loadedRefId,
                        structuredClone(handle.document),
                    ]),
            ),
    };
}

function loadCorpus(path: string): Corpus {
    const value: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (!isRecord(value) || value["formatVersion"] !== 1 || typeof value["server"] !== "string") {
        throw new Error("Invalid model fixture header.");
    }
    if (!Array.isArray(value["models"])) {
        throw new Error("Model fixture must contain a models array.");
    }

    const records = new Map<string, FixtureRecord>();
    const seenRefs = new Set<string>();
    let migrationFailures = 0;
    for (const entry of value["models"]) {
        if (
            !isRecord(entry) ||
            typeof entry["refId"] !== "string" ||
            !isRecord(entry["document"])
        ) {
            throw new Error("Invalid model fixture entry.");
        }
        const refId = entry["refId"];
        if (seenRefs.has(refId)) {
            throw new Error(`Duplicate fixture reference ${refId}.`);
        }
        seenRefs.add(refId);

        let document: Document;
        try {
            document = migrateDocument(structuredClone(entry["document"])) as Document;
        } catch {
            migrationFailures += 1;
            continue;
        }
        if (document.type !== "model") {
            migrationFailures += 1;
            continue;
        }
        records.set(refId, { refId, document });
    }

    const candidates = [...records.values()].filter(
        ({ document }) => document.theory in shapeByTheory,
    );
    return {
        server: value["server"],
        records,
        candidates,
        migrationFailures,
        total: value["models"].length,
    };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readPositiveInteger(name: string): number | undefined {
    const value = process.env[name];
    if (value === undefined) {
        return undefined;
    }
    const parsed = Number.parseInt(value, 10);
    if (!Number.isSafeInteger(parsed) || parsed <= 0) {
        throw new Error(`${name} must be a positive integer.`);
    }
    return parsed;
}

function seedFromRef(refId: string): number {
    let hash = 0x811c9dc5;
    for (const char of refId) {
        hash ^= char.codePointAt(0) ?? 0;
        hash = Math.imul(hash, 0x01000193);
    }
    return hash & 0x7fffffff;
}
