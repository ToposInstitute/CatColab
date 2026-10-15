// @vitest-environment happy-dom
import { splice } from "@automerge/automerge";
import { Repo } from "@automerge/automerge-repo";
import type { EditorView } from "prosemirror-view";
import { makeDocumentProjection } from "solid-automerge";
import { render } from "solid-js/web";
import { describe, expect, test, vi } from "vitest";

import { Nb } from "catcolab-document-methods";
import { RichTextEditor } from "./rich_text_editor";

async function createFixture() {
    const repo = new Repo();
    const text = Nb.newRichTextCell("Review");
    const decision = Nb.newFormalCell("Decision");
    const project = Nb.newFormalCell("Project");
    const notebook = Nb.newNotebook<string>();
    for (const cell of [text, decision, project]) {
        Nb.appendCell(notebook, cell);
    }
    const handle = repo.create({ notebook });
    const path = ["notebook", "cellContents", text.id, "content"];
    const views: EditorView[] = [];
    const container = document.createElement("div");
    document.body.appendChild(container);
    let projection!: ReturnType<typeof handle.doc>;
    const dispose = render(() => {
        projection = makeDocumentProjection(handle);
        // Intentionally keep the component mounted when its cell disappears:
        // structural changes must be safe independently of parent cleanup.
        return <RichTextEditor handle={handle} path={path} ref={(view) => views.push(view)} />;
    }, container);
    await vi.waitFor(() => expect(views).toHaveLength(1));

    return {
        handle,
        path,
        projection,
        text,
        decision,
        project,
        views,
        async cleanup() {
            dispose();
            container.remove();
            await repo.shutdown();
        },
    };
}

describe("rich text editor structural changes", () => {
    test("ordinary text edits still synchronize without rebuilding the view", async () => {
        const fixture = await createFixture();
        const { handle, path, projection, text, views } = fixture;
        try {
            handle.change((doc) => splice(doc, path, 0, 6, "Updated"));
            expect(views).toHaveLength(1);
            const view = views[0]!;
            expect(view.state.doc.textContent).toBe("Updated");

            view.dispatch(view.state.tr.insertText("!", view.state.doc.content.size - 1));
            expect(projection.notebook.cellContents[text.id]?.content).toContain("Updated!");
        } finally {
            await fixture.cleanup();
        }
    });

    test("unmounting cancels a queued rebuild", async () => {
        const fixture = await createFixture();
        const { handle, text, views } = fixture;
        try {
            handle.change((doc) => {
                doc.notebook.cellContents[text.id]!.content = "Replacement";
            });
        } finally {
            await fixture.cleanup();
        }
        expect(views).toHaveLength(1);
        expect(views[0]!.isDestroyed).toBe(true);
    });

    test("deleting text does not replay a deletion against the next cell", async () => {
        const fixture = await createFixture();
        const { handle, projection, decision, project, views } = fixture;
        try {
            handle.change((doc) => Nb.deleteCellAtIndex(doc.notebook, 0));
            await Promise.resolve();
            expect(views[0]!.isDestroyed).toBe(true);
            expect(views).toHaveLength(1);

            // If a change listener throws during deletion, DocHandle does not
            // advance its checkpoint and this update re-emits the deletion.
            handle.update((doc) => doc);
            expect(projection.notebook.cellOrder).toEqual([decision.id, project.id]);
            expect(handle.doc().notebook.cellOrder).toEqual([decision.id, project.id]);
            expect(projection.notebook.cellContents[decision.id]?.content).toBe("Decision");
        } finally {
            await fixture.cleanup();
        }
    });

    test("restoring deleted text recreates an editable view", async () => {
        const fixture = await createFixture();
        const { handle, projection, text, views } = fixture;
        try {
            handle.change((doc) => Nb.deleteCellAtIndex(doc.notebook, 0));
            await Promise.resolve();
            handle.change((doc) => Nb.insertCellAtIndex(doc.notebook, text, 0));
            await Promise.resolve();
            expect(views).toHaveLength(2);
            expect(views[0]!.isDestroyed).toBe(true);
            expect(views[1]!.state.doc.textContent).toBe("Review");

            const view = views[1]!;
            view.dispatch(view.state.tr.insertText(" restored", view.state.doc.content.size - 1));
            expect(projection.notebook.cellContents[text.id]?.content).toContain("Review restored");

            // Replacement still needs a fresh binding, including empty text.
            handle.change((doc) => {
                doc.notebook.cellContents[text.id]!.content = "";
            });
            await Promise.resolve();
            expect(views).toHaveLength(3);
            expect(view.isDestroyed).toBe(true);
            expect(views[2]!.state.doc.textContent).toBe("");
        } finally {
            await fixture.cleanup();
        }
    });
});
