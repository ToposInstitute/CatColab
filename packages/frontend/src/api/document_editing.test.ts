import { next as Automerge } from "@automerge/automerge";
import { type DocHandle, isValidDocumentId, Repo } from "@automerge/automerge-repo";
import { BrowserWebSocketClientAdapter } from "@automerge/automerge-repo-network-websocket";
import type { DocInfo, UserState } from "catcolab-api/src/user_state";
import { type FirebaseOptions, initializeApp } from "firebase/app";
import { deleteUser, getAuth, signInWithEmailAndPassword } from "firebase/auth";
import invariant from "tiny-invariant";
import { v4 } from "uuid";
import { afterAll, assert, describe, test } from "vitest";

import type { Document, ModelDocument } from "catcolab-document-editing";
import { normalizeImmutableStrings } from "../util/immutable_string";
import { createTestDocument, initTestUserAuth } from "../util/test_util.ts";
import { createFetchWithAuth, createRpcClient, unwrap } from "./rpc.ts";

const serverUrl = import.meta.env.VITE_SERVER_URL;
const repoUrl = import.meta.env.VITE_AUTOMERGE_REPO_URL;
const firebaseOptions = JSON.parse(import.meta.env.VITE_FIREBASE_OPTIONS) as FirebaseOptions;

const firebaseApp = initializeApp(firebaseOptions);
const rpc = createRpcClient(serverUrl, createFetchWithAuth(firebaseApp));

const repo = new Repo({
    network: [new BrowserWebSocketClientAdapter(repoUrl)],
});

const waitFor = async (
    condition: () => boolean,
    message: string,
    timeoutMs = 15000,
    intervalMs = 100,
) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        if (condition()) {
            return;
        }
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
    assert(condition(), message);
};

describe("Document editing, snapshots, and undo/redo", async () => {
    const auth = getAuth(firebaseApp);
    const email = "test-doc-editing@catcolab.org";
    const password = "foobar";
    await initTestUserAuth(auth, email, password);

    const user = auth.currentUser;
    invariant(user);

    const createdRefs: string[] = [];
    afterAll(async () => {
        for (const id of createdRefs) {
            await rpc.delete_ref.mutate(id).catch(() => {});
        }
        await deleteUser(user);
        void repo.shutdown();
    });

    unwrap(await rpc.sign_up_or_sign_in.mutate());

    const userStateDocId = unwrap(await rpc.get_user_state_doc_id.query());
    assert(isValidDocumentId(userStateDocId));

    const userStateHandle: DocHandle<UserState> = await repo.find(userStateDocId);
    await userStateHandle.whenReady();

    let latestState = userStateHandle.doc();
    userStateHandle.on("change", ({ doc }) => {
        latestState = normalizeImmutableStrings(doc);
    });

    const findDoc = (refId: string): DocInfo | undefined => latestState?.documents[refId];

    const createDoc = async (name: string): Promise<string> => {
        const refId = unwrap(await rpc.new_ref.mutate(createTestDocument(name)));
        createdRefs.push(refId);
        return refId;
    };

    const getLiveHandle = async (refId: string): Promise<DocHandle<Document>> => {
        const refDoc = unwrap(await rpc.get_doc.query(refId));
        assert(refDoc.tag === "Live", "Document should be live");
        assert(isValidDocumentId(refDoc.docId));
        const handle: DocHandle<Document> = await repo.find(refDoc.docId);
        await handle.whenReady();
        return handle;
    };

    // ---------------------------------------------------------------
    // Editing a document via Automerge propagates changes
    // ---------------------------------------------------------------
    test.sequential("should edit document name via Automerge handle", async () => {
        const name = `Edit Test - ${v4()}`;
        const refId = await createDoc(name);
        const handle = await getLiveHandle(refId);

        assert.strictEqual(handle.doc().name, name);

        const newName = `Edited - ${v4()}`;
        handle.change((doc) => {
            doc.name = newName;
        });

        assert.strictEqual(handle.doc().name, newName);
    });

    // ---------------------------------------------------------------
    // Autosave creates a second snapshot after edits
    // ---------------------------------------------------------------
    test.sequential("should create a new snapshot via autosave after editing", async () => {
        await signInWithEmailAndPassword(auth, email, password);

        const name = `Autosave Test - ${v4()}`;
        const refId = await createDoc(name);

        await waitFor(
            () => findDoc(refId) !== undefined,
            `Document ${refId} should appear in user state`,
        );

        const initialDoc = findDoc(refId);
        assert(initialDoc, "Document should exist");
        assert.strictEqual(
            Object.keys(initialDoc.snapshots).length,
            1,
            "Should start with one snapshot",
        );

        const handle = await getLiveHandle(refId);

        const newName = `Autosaved - ${v4()}`;
        handle.change((doc) => {
            doc.name = newName;
        });

        await waitFor(() => {
            const doc = findDoc(refId);
            return doc !== undefined && Object.keys(doc.snapshots).length >= 2;
        }, "Should have a second snapshot after autosave");

        const afterDoc = findDoc(refId);
        assert(afterDoc);
        assert.strictEqual(Object.keys(afterDoc.snapshots).length, 2, "Should have two snapshots");
    });

    // ---------------------------------------------------------------
    // Snapshot chain has correct parent/child structure
    // ---------------------------------------------------------------
    test.sequential("should have correct parent/child snapshot structure", async () => {
        await signInWithEmailAndPassword(auth, email, password);

        const name = `Chain Test - ${v4()}`;
        const refId = await createDoc(name);

        await waitFor(
            () => findDoc(refId) !== undefined,
            `Document ${refId} should appear in user state`,
        );

        const initialDoc = findDoc(refId);
        assert(initialDoc);
        const originalSnapshotId = Object.keys(initialDoc.snapshots)[0]!;
        const originalSnapshot = initialDoc.snapshots[originalSnapshotId]!;
        assert.strictEqual(originalSnapshot.parent, null, "Root snapshot should have no parent");

        const handle = await getLiveHandle(refId);
        handle.change((doc) => {
            doc.name = `Chain V2 - ${v4()}`;
        });

        await waitFor(() => {
            const doc = findDoc(refId);
            return doc !== undefined && Object.keys(doc.snapshots).length >= 2;
        }, "Should have two snapshots");

        const afterDoc = findDoc(refId);
        assert(afterDoc);
        const snapshotIds = Object.keys(afterDoc.snapshots);
        assert.strictEqual(snapshotIds.length, 2, "Should have exactly two snapshots");

        const newSnapshotId = snapshotIds.find((id) => id !== originalSnapshotId)!;
        const newSnapshot = afterDoc.snapshots[newSnapshotId]!;
        assert.strictEqual(
            newSnapshot.parent,
            Number(originalSnapshotId),
            "Second snapshot should have first as parent",
        );
    });

    // ---------------------------------------------------------------
    // load_snapshot reverts the live document content
    // ---------------------------------------------------------------
    test.sequential("should revert live document content when navigating to an older snapshot", async () => {
        await signInWithEmailAndPassword(auth, email, password);

        const originalName = `Revert Original - ${v4()}`;
        const refId = await createDoc(originalName);

        await waitFor(
            () => findDoc(refId) !== undefined,
            `Document ${refId} should appear in user state`,
        );

        const initialDoc = findDoc(refId);
        assert(initialDoc);
        const originalSnapshotId = Number(Object.keys(initialDoc.snapshots)[0]!);

        const handle = await getLiveHandle(refId);
        assert.strictEqual(handle.doc().name, originalName);

        const editedName = `Revert Edited - ${v4()}`;
        handle.change((doc) => {
            doc.name = editedName;
        });
        assert.strictEqual(handle.doc().name, editedName);

        await waitFor(() => {
            const doc = findDoc(refId);
            return doc !== undefined && Object.keys(doc.snapshots).length >= 2;
        }, "Should have two snapshots after autosave");

        // Navigate back to the original snapshot.
        unwrap(await rpc.load_snapshot.mutate(refId, originalSnapshotId));

        // The live Automerge document should revert to the original content.
        await waitFor(
            () => handle.doc().name === originalName,
            `Live document name should revert to "${originalName}" but is "${handle.doc().name}"`,
        );

        assert.strictEqual(
            handle.doc().name,
            originalName,
            "Live document should have original name after reverting",
        );
    });

    // ---------------------------------------------------------------
    // load_snapshot updates the database snapshot content
    // ---------------------------------------------------------------
    test.sequential("should update document content after navigating to an older snapshot", async () => {
        await signInWithEmailAndPassword(auth, email, password);

        const originalName = `DB Revert Original - ${v4()}`;
        const refId = await createDoc(originalName);

        await waitFor(
            () => findDoc(refId) !== undefined,
            `Document ${refId} should appear in user state`,
        );

        const initialDoc = findDoc(refId);
        assert(initialDoc);
        const originalSnapshotId = Number(Object.keys(initialDoc.snapshots)[0]!);

        const handle = await getLiveHandle(refId);

        const editedName = `DB Revert Edited - ${v4()}`;
        handle.change((doc) => {
            doc.name = editedName;
        });

        await waitFor(() => {
            const doc = findDoc(refId);
            return doc !== undefined && Object.keys(doc.snapshots).length >= 2;
        }, "Should have two snapshots after autosave");

        // Verify the live document shows the edited version.
        assert.strictEqual(handle.doc()?.name, editedName, "live doc should show edited name");

        // Navigate back to original.
        unwrap(await rpc.load_snapshot.mutate(refId, originalSnapshotId));

        // The current snapshot should now point to the original.
        await waitFor(() => {
            const doc = findDoc(refId);
            return doc !== undefined && doc.currentSnapshot === originalSnapshotId;
        }, "currentSnapshot should point to original");

        // The live document should be reverted to the original content.
        await waitFor(
            () => handle.doc()?.name === originalName,
            "live doc should show original name after revert",
        );
        assert.strictEqual(
            handle.doc()?.name,
            originalName,
            "live doc should show original name after revert",
        );
    });

    // ---------------------------------------------------------------
    // Multiple edits → multiple snapshots → navigate history
    // ---------------------------------------------------------------
    test.sequential("should navigate through a chain of three snapshots", async () => {
        await signInWithEmailAndPassword(auth, email, password);

        const name1 = `History V1 - ${v4()}`;
        const refId = await createDoc(name1);

        await waitFor(
            () => findDoc(refId) !== undefined,
            `Document ${refId} should appear in user state`,
        );

        const initialDoc = findDoc(refId);
        assert(initialDoc);
        const snapshot1Id = Number(Object.keys(initialDoc.snapshots)[0]!);

        const handle = await getLiveHandle(refId);

        // Edit 1 → autosave → snapshot 2
        const name2 = `History V2 - ${v4()}`;
        handle.change((doc) => {
            doc.name = name2;
        });

        await waitFor(() => {
            const doc = findDoc(refId);
            return doc !== undefined && Object.keys(doc.snapshots).length >= 2;
        }, "Should have two snapshots after first edit");

        const after2 = findDoc(refId);
        assert(after2);
        const snapshot2Id = after2.currentSnapshot;
        assert(snapshot2Id !== snapshot1Id);

        // Edit 2 → autosave → snapshot 3
        const name3 = `History V3 - ${v4()}`;
        handle.change((doc) => {
            doc.name = name3;
        });

        await waitFor(() => {
            const doc = findDoc(refId);
            return doc !== undefined && Object.keys(doc.snapshots).length >= 3;
        }, "Should have three snapshots after second edit");

        const after3 = findDoc(refId);
        assert(after3);
        const snapshot3Id = after3.currentSnapshot;
        assert(snapshot3Id !== snapshot2Id);

        // Navigate back to V1
        unwrap(await rpc.load_snapshot.mutate(refId, snapshot1Id));

        await waitFor(
            () => handle.doc().name === name1,
            `Document should revert to V1 name "${name1}" but is "${handle.doc().name}"`,
        );
        assert.strictEqual(handle.doc().name, name1);

        // Navigate forward to V2
        unwrap(await rpc.load_snapshot.mutate(refId, snapshot2Id));

        await waitFor(
            () => handle.doc().name === name2,
            `Document should show V2 name "${name2}" but is "${handle.doc().name}"`,
        );
        assert.strictEqual(handle.doc().name, name2);

        // Navigate forward to V3
        unwrap(await rpc.load_snapshot.mutate(refId, snapshot3Id));

        await waitFor(
            () => handle.doc().name === name3,
            `Document should show V3 name "${name3}" but is "${handle.doc().name}"`,
        );
        assert.strictEqual(handle.doc().name, name3);
    });

    // ---------------------------------------------------------------
    // Undo (go to parent) and redo (go to child)
    // ---------------------------------------------------------------
    test.sequential("should undo and redo through snapshot history", async () => {
        await signInWithEmailAndPassword(auth, email, password);

        const name1 = `Undo V1 - ${v4()}`;
        const refId = await createDoc(name1);

        await waitFor(
            () => findDoc(refId) !== undefined,
            `Document ${refId} should appear in user state`,
        );

        const initialDoc = findDoc(refId);
        assert(initialDoc);
        const snapshot1Id = Number(Object.keys(initialDoc.snapshots)[0]!);

        const handle = await getLiveHandle(refId);

        const name2 = `Undo V2 - ${v4()}`;
        handle.change((doc) => {
            doc.name = name2;
        });

        await waitFor(() => {
            const doc = findDoc(refId);
            return doc !== undefined && Object.keys(doc.snapshots).length >= 2;
        }, "Should have two snapshots");

        const after = findDoc(refId);
        assert(after);
        const snapshot2Id = after.currentSnapshot;

        // Undo: navigate to parent (snapshot 1)
        unwrap(await rpc.load_snapshot.mutate(refId, snapshot1Id));

        await waitFor(
            () => handle.doc().name === name1,
            `Undo should revert to "${name1}" but is "${handle.doc().name}"`,
        );
        assert.strictEqual(handle.doc().name, name1, "After undo, name should be V1");

        // Redo: navigate back to child (snapshot 2)
        unwrap(await rpc.load_snapshot.mutate(refId, snapshot2Id));

        await waitFor(
            () => handle.doc().name === name2,
            `Redo should restore to "${name2}" but is "${handle.doc().name}"`,
        );
        assert.strictEqual(handle.doc().name, name2, "After redo, name should be V2");
    });

    // ---------------------------------------------------------------
    // Editing after undo creates a branch
    // ---------------------------------------------------------------
    test.sequential("should allow editing after navigating to an older snapshot", async () => {
        await signInWithEmailAndPassword(auth, email, password);

        const name1 = `Branch V1 - ${v4()}`;
        const refId = await createDoc(name1);

        await waitFor(
            () => findDoc(refId) !== undefined,
            `Document ${refId} should appear in user state`,
        );

        const initialDoc = findDoc(refId);
        assert(initialDoc);
        const snapshot1Id = Number(Object.keys(initialDoc.snapshots)[0]!);

        const handle = await getLiveHandle(refId);

        const name2 = `Branch V2 - ${v4()}`;
        handle.change((doc) => {
            doc.name = name2;
        });

        await waitFor(() => {
            const doc = findDoc(refId);
            return doc !== undefined && Object.keys(doc.snapshots).length >= 2;
        }, "Should have two snapshots");

        // Undo to V1
        unwrap(await rpc.load_snapshot.mutate(refId, snapshot1Id));

        await waitFor(
            () => handle.doc().name === name1,
            `Should revert to V1 "${name1}" but is "${handle.doc().name}"`,
        );

        // Now edit from V1 (creating a branch)
        const name3 = `Branch V3 - ${v4()}`;
        handle.change((doc) => {
            doc.name = name3;
        });

        assert.strictEqual(handle.doc().name, name3, "After branching edit, name should be V3");

        // Wait for the branch edit to autosave
        await waitFor(() => {
            const doc = findDoc(refId);
            return doc !== undefined && Object.keys(doc.snapshots).length >= 3;
        }, "Should have three snapshots after branching edit");
    });

    // ---------------------------------------------------------------
    // Content beyond just name is preserved during revert
    // ---------------------------------------------------------------
    test.sequential("should preserve full document structure when reverting snapshots", async () => {
        await signInWithEmailAndPassword(auth, email, password);

        const name = `Structure Test - ${v4()}`;
        const refId = await createDoc(name);

        await waitFor(
            () => findDoc(refId) !== undefined,
            `Document ${refId} should appear in user state`,
        );

        const initialDoc = findDoc(refId);
        assert(initialDoc);
        const originalSnapshotId = Number(Object.keys(initialDoc.snapshots)[0]!);

        const refDoc = unwrap(await rpc.get_doc.query(refId));
        assert(refDoc.tag === "Live");
        assert(isValidDocumentId(refDoc.docId));
        const handle: DocHandle<ModelDocument> = await repo.find(refDoc.docId);
        await handle.whenReady();

        const doc = handle.doc();
        assert.strictEqual(doc.type, "model", "Document type should be model");
        assert.strictEqual(doc.theory, "empty", "Document theory should be empty");
        assert.deepStrictEqual(doc.notebook.cellOrder, [], "Cell order should be empty");

        handle.change((doc) => {
            doc.name = `Structure Edited - ${v4()}`;
            doc.theory = "causal-loop";
            doc.notebook.cellOrder = ["cell1"];
            doc.notebook.cellContents.cell1 = {
                tag: "rich-text",
                id: "cell1",
                content: "Hello world",
            };
        });

        await waitFor(() => {
            const doc = findDoc(refId);
            return doc !== undefined && Object.keys(doc.snapshots).length >= 2;
        }, "Should have two snapshots after edit");

        // Revert to original
        unwrap(await rpc.load_snapshot.mutate(refId, originalSnapshotId));

        await waitFor(
            () => handle.doc().theory === "empty",
            `Theory should revert to "empty" but is "${handle.doc().theory}"`,
        );

        const reverted = handle.doc();
        assert.strictEqual(reverted.name, name, "Name should revert");
        assert.strictEqual(reverted.theory, "empty", "Theory should revert to empty");
        assert.deepStrictEqual(
            reverted.notebook.cellOrder,
            [],
            "Cell order should revert to empty",
        );
    });

    // ---------------------------------------------------------------
    // load_snapshot should NOT create a spurious snapshot
    // ---------------------------------------------------------------
    test.sequential(
        "should not create extra snapshots when navigating to a historical snapshot",
        { timeout: 15000 },
        async () => {
            await signInWithEmailAndPassword(auth, email, password);

            const name = `No Spurious Snapshot - ${v4()}`;
            const refId = await createDoc(name);

            await waitFor(
                () => findDoc(refId) !== undefined,
                `Document ${refId} should appear in user state`,
            );

            const initialDoc = findDoc(refId);
            assert(initialDoc);
            const originalSnapshotId = Number(Object.keys(initialDoc.snapshots)[0]!);

            const handle = await getLiveHandle(refId);

            const editedName = `Spurious Edited - ${v4()}`;
            handle.change((doc) => {
                doc.name = editedName;
            });

            await waitFor(() => {
                const doc = findDoc(refId);
                return doc !== undefined && Object.keys(doc.snapshots).length >= 2;
            }, "Should have two snapshots after autosave");

            const beforeRevert = findDoc(refId);
            assert(beforeRevert);
            assert.strictEqual(
                Object.keys(beforeRevert.snapshots).length,
                2,
                "Should have exactly two snapshots before revert",
            );

            unwrap(await rpc.load_snapshot.mutate(refId, originalSnapshotId));

            await waitFor(
                () => handle.doc().name === name,
                `Live document name should revert to "${name}"`,
            );

            // Wait well past the autosave debounce (500ms) to ensure no
            // spurious snapshot is created by the revert's document change.
            await new Promise((resolve) => setTimeout(resolve, 2000));

            const afterRevert = findDoc(refId);
            assert(afterRevert);
            assert.strictEqual(
                Object.keys(afterRevert.snapshots).length,
                2,
                "Snapshot count should still be 2 — revert must not create a spurious snapshot",
            );
        },
    );

    // ---------------------------------------------------------------
    // Rich text marks are preserved through snapshot navigation
    // ---------------------------------------------------------------
    test.sequential(
        "should preserve rich text marks when navigating to a historical snapshot",
        { timeout: 15000 },
        async () => {
            await signInWithEmailAndPassword(auth, email, password);

            const name = `Rich Text Marks - ${v4()}`;
            const refId = await createDoc(name);

            await waitFor(
                () => findDoc(refId) !== undefined,
                `Document ${refId} should appear in user state`,
            );

            const initialDoc = findDoc(refId);
            assert(initialDoc);

            const refDoc = unwrap(await rpc.get_doc.query(refId));
            assert(refDoc.tag === "Live");
            assert(isValidDocumentId(refDoc.docId));
            const handle: DocHandle<ModelDocument> = await repo.find(refDoc.docId);
            await handle.whenReady();

            const cellId = v4();

            handle.change((doc) => {
                doc.notebook.cellOrder.push(cellId);
                doc.notebook.cellContents[cellId] = {
                    tag: "rich-text",
                    id: cellId,
                    content: "",
                };
                Automerge.splice(
                    doc,
                    ["notebook", "cellContents", cellId, "content"],
                    0,
                    0,
                    "Hello bold world",
                );
                Automerge.mark(
                    doc,
                    ["notebook", "cellContents", cellId, "content"],
                    { start: 6, end: 10, expand: "after" },
                    "bold",
                    true,
                );
            });

            const textPath = ["notebook", "cellContents", cellId, "content"];
            const marksBeforeSnapshot = Automerge.marks(handle.doc(), textPath);
            assert.strictEqual(marksBeforeSnapshot.length, 1, "Should have one bold mark");
            assert.strictEqual(marksBeforeSnapshot[0]!.name, "bold");
            assert.strictEqual(marksBeforeSnapshot[0]!.start, 6);
            assert.strictEqual(marksBeforeSnapshot[0]!.end, 10);

            await waitFor(() => {
                const doc = findDoc(refId);
                return doc !== undefined && Object.keys(doc.snapshots).length >= 2;
            }, "Should have two snapshots after autosave");

            const afterEdit = findDoc(refId);
            assert(afterEdit);
            const markedSnapshotId = afterEdit.currentSnapshot;

            handle.change((doc) => {
                doc.name = `Rich Text Edited - ${v4()}`;
            });

            await waitFor(() => {
                const doc = findDoc(refId);
                return doc !== undefined && Object.keys(doc.snapshots).length >= 3;
            }, "Should have three snapshots after second edit");

            // Navigate back to the snapshot that had marks.
            unwrap(await rpc.load_snapshot.mutate(refId, markedSnapshotId));

            await waitFor(
                () => handle.doc().name === name,
                `Should revert to original name "${name}" but is "${handle.doc().name}"`,
            );

            // The critical assertion: marks must survive the round-trip through
            // hydrate_to_json → populate_automerge_from_json.
            const marksAfterRevert = Automerge.marks(handle.doc(), textPath);
            assert.strictEqual(
                marksAfterRevert.length,
                1,
                `Bold mark should be preserved after snapshot navigation, ` +
                    `but got ${JSON.stringify(marksAfterRevert)}`,
            );
            assert.strictEqual(marksAfterRevert[0]!.name, "bold");
            assert.strictEqual(marksAfterRevert[0]!.start, 6);
            assert.strictEqual(marksAfterRevert[0]!.end, 10);
        },
    );

    // ---------------------------------------------------------------
    // Redo does not bleed rich text content across cells
    // ---------------------------------------------------------------
    test.sequential(
        "should not copy rich text content to other cells on redo",
        { timeout: 20000 },
        async () => {
            await signInWithEmailAndPassword(auth, email, password);

            const name = `Multi Cell Redo - ${v4()}`;
            const refId = await createDoc(name);

            await waitFor(
                () => findDoc(refId) !== undefined,
                `Document ${refId} should appear in user state`,
            );

            const refDoc = unwrap(await rpc.get_doc.query(refId));
            assert(refDoc.tag === "Live");
            assert(isValidDocumentId(refDoc.docId));
            const handle: DocHandle<ModelDocument> = await repo.find(refDoc.docId);
            await handle.whenReady();

            const cellA = v4();
            const cellB = v4();

            handle.change((doc) => {
                doc.notebook.cellOrder.push(cellA);
                doc.notebook.cellContents[cellA] = {
                    tag: "rich-text",
                    id: cellA,
                    content: "",
                };
                Automerge.splice(
                    doc,
                    ["notebook", "cellContents", cellA, "content"],
                    0,
                    0,
                    "Alpha content",
                );

                doc.notebook.cellOrder.push(cellB);
                doc.notebook.cellContents[cellB] = {
                    tag: "rich-text",
                    id: cellB,
                    content: "",
                };
                Automerge.splice(
                    doc,
                    ["notebook", "cellContents", cellB, "content"],
                    0,
                    0,
                    "Beta content",
                );
            });

            const contentOf = (cellId: string) => {
                const cell = handle.doc().notebook.cellContents[cellId];
                return cell?.tag === "rich-text" ? cell.content : undefined;
            };

            assert.strictEqual(contentOf(cellA), "Alpha content");
            assert.strictEqual(contentOf(cellB), "Beta content");

            // Wait for autosave → snapshot 2 (both cells present).
            await waitFor(() => {
                const doc = findDoc(refId);
                return doc !== undefined && Object.keys(doc.snapshots).length >= 2;
            }, "Should have two snapshots after adding cells");

            const afterCells = findDoc(refId);
            assert(afterCells);
            const twoCellSnapshotId = afterCells.currentSnapshot;

            // Edit only cell A.
            handle.change((doc) => {
                Automerge.splice(
                    doc,
                    ["notebook", "cellContents", cellA, "content"],
                    0,
                    13,
                    "Alpha edited!",
                );
            });

            assert.strictEqual(contentOf(cellA), "Alpha edited!");
            assert.strictEqual(contentOf(cellB), "Beta content");

            // Wait for autosave → snapshot 3.
            await waitFor(() => {
                const doc = findDoc(refId);
                return doc !== undefined && Object.keys(doc.snapshots).length >= 3;
            }, "Should have three snapshots after editing cell A");

            const afterEdit = findDoc(refId);
            assert(afterEdit);
            const editedSnapshotId = afterEdit.currentSnapshot;

            // Undo: navigate back to snapshot 2 (before cell A edit).
            unwrap(await rpc.load_snapshot.mutate(refId, twoCellSnapshotId));
            await waitFor(
                () => contentOf(cellA) === "Alpha content",
                "Undo should revert cell A to original",
            );

            assert.strictEqual(
                contentOf(cellA),
                "Alpha content",
                "After undo, cell A should have original content",
            );
            assert.strictEqual(
                contentOf(cellB),
                "Beta content",
                "After undo, cell B should still have its own content",
            );

            // Redo: navigate forward to snapshot 3 (cell A edited).
            unwrap(await rpc.load_snapshot.mutate(refId, editedSnapshotId));
            await waitFor(
                () => contentOf(cellA) === "Alpha edited!",
                "Redo should restore cell A edit",
            );

            assert.strictEqual(
                contentOf(cellA),
                "Alpha edited!",
                "After redo, cell A should have edited content",
            );
            assert.strictEqual(
                contentOf(cellB),
                "Beta content",
                `After redo, cell B must keep its own content, but got "${contentOf(cellB)}"`,
            );
        },
    );

    // ---------------------------------------------------------------
    // Block markers survive snapshot navigation (no U+FFFC leak)
    // ---------------------------------------------------------------
    test.sequential(
        "should preserve block markers as structural elements after undo",
        { timeout: 15000 },
        async () => {
            await signInWithEmailAndPassword(auth, email, password);

            const name = `Block Markers - ${v4()}`;
            const refId = await createDoc(name);

            await waitFor(
                () => findDoc(refId) !== undefined,
                `Document ${refId} should appear in user state`,
            );

            const initialDoc = findDoc(refId);
            assert(initialDoc);

            const refDoc = unwrap(await rpc.get_doc.query(refId));
            assert(refDoc.tag === "Live");
            assert(isValidDocumentId(refDoc.docId));
            const handle: DocHandle<ModelDocument> = await repo.find(refDoc.docId);
            await handle.whenReady();

            const cellId = v4();
            const contentPath = ["notebook", "cellContents", cellId, "content"];

            handle.change((doc) => {
                doc.notebook.cellOrder.push(cellId);
                doc.notebook.cellContents[cellId] = {
                    tag: "rich-text",
                    id: cellId,
                    content: "",
                };
                Automerge.splitBlock(doc, contentPath, 0, {
                    type: "paragraph",
                });
                Automerge.splice(doc, contentPath, 1, 0, "hello 1");
            });

            const spansBefore = Automerge.spans(handle.doc(), contentPath);
            assert.strictEqual(spansBefore.length, 2, "Should have block + text span");
            assert.strictEqual(
                spansBefore[0]!.type,
                "block",
                "First span should be a block marker",
            );
            assert.strictEqual(spansBefore[1]!.type, "text", "Second span should be text");
            assert.strictEqual(spansBefore[1]!.value, "hello 1");

            await waitFor(() => {
                const doc = findDoc(refId);
                return doc !== undefined && Object.keys(doc.snapshots).length >= 2;
            }, "Should have two snapshots after adding cell with block marker");

            const afterEdit = findDoc(refId);
            assert(afterEdit);
            const withBlockSnapshotId = afterEdit.currentSnapshot;

            // Make another edit to create a third snapshot.
            handle.change((doc) => {
                doc.name = `Block Markers Edited - ${v4()}`;
            });

            await waitFor(() => {
                const doc = findDoc(refId);
                return doc !== undefined && Object.keys(doc.snapshots).length >= 3;
            }, "Should have three snapshots");

            // Undo: navigate back to the snapshot with the block marker.
            unwrap(await rpc.load_snapshot.mutate(refId, withBlockSnapshotId));
            await waitFor(() => handle.doc().name === name, `Should revert to original name`);

            // The critical check: spans must still be structural, not
            // literal U+FFFC characters in the text.
            const spansAfter = Automerge.spans(handle.doc(), contentPath);
            assert.strictEqual(
                spansAfter.length,
                2,
                `Should still have 2 spans (block + text) after undo, ` +
                    `but got ${JSON.stringify(spansAfter)}`,
            );
            assert.strictEqual(
                spansAfter[0]!.type,
                "block",
                `First span should be a block marker after undo, ` +
                    `but got ${JSON.stringify(spansAfter[0])}`,
            );
            assert.strictEqual(spansAfter[1]!.type, "text");
            assert.strictEqual(
                spansAfter[1]!.value,
                "hello 1",
                `Text should be 'hello 1' without U+FFFC chars, ` +
                    `but got ${JSON.stringify(spansAfter[1]!.value)}`,
            );
        },
    );
});
