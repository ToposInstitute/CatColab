import type { AutomergeUrl, DocHandle } from "@automerge/automerge-repo";
import { subscribe } from "@inkandswitch/patchwork-providers";
import { type Accessor, createEffect, createSignal, For, onCleanup } from "solid-js";

import type { Uuid } from "catlog-wasm";
import type { NotebookComments } from "../../frontend/src/notebook";

/** A document whose notebook cells can be commented on. */
type CommentableDoc = { "@comments"?: { threads: CommentThread[] } };

/** A Patchwork comment thread, stored inline under the document's `@comments`.

Mirrors the format of Patchwork's comments, so the threads also show up in its
comments sidebar.
 */
type CommentThread = {
    id: string;
    refs: AutomergeUrl[];
    isResolved: boolean;
    comments: Comment[];
    "@patchwork"?: { type: string };
};

type Comment = {
    id: string;
    content?: string;
    draftContent?: string;
    contactUrl: AutomergeUrl;
    timestamp: number;
};

/** The `@patchwork.type` of a thread, naming the tool that shows it. */
const COMMENT_THREAD_TYPE = "comment-thread";

/** Patchwork document handles address sub-documents by path, a newer API than
the `automerge-repo` types we build against. Keys may be matched by `{ id }`.
 */
type SubHandle = DocHandle<CommentableDoc> & {
    sub(...path: (string | { id: string })[]): { url: AutomergeUrl };
};

/** Patchwork comments on the cells of a notebook document.

Each cell's threads target the cell's sub-document URL and are shown with
Patchwork's `comment-thread` tool. Threads are created as the current contact,
with an empty draft comment for the author to fill in.
 */
export function createNotebookComments(
    element: HTMLElement,
    handle: Accessor<DocHandle<unknown>>,
    doc: Accessor<object>,
): NotebookComments {
    const [contactUrl, setContactUrl] = createSignal<AutomergeUrl>();
    onCleanup(subscribe<AutomergeUrl>(element, { type: "patchwork:contact" }, setContactUrl));

    const subHandle = () => handle() as SubHandle;
    const cellUrl = (cellId: Uuid) => subHandle().sub("notebook", "cellContents", cellId).url;
    const threadUrl = (thread: CommentThread) =>
        subHandle().sub("@comments", "threads", { id: thread.id }).url;

    const threadsOn = (cellId: Uuid) => {
        const target = cellUrl(cellId);
        return ((doc() as CommentableDoc)["@comments"]?.threads ?? []).filter(
            (thread) => !thread.isResolved && thread.refs.includes(target),
        );
    };

    return {
        count: (cellId) => threadsOn(cellId).length,

        add(cellId) {
            const contact = contactUrl();
            if (!contact) {
                console.warn("[catcolab] cannot comment: no Patchwork contact");
                return;
            }
            const target = cellUrl(cellId);
            subHandle().change((doc) => {
                doc["@comments"] ??= { threads: [] };
                doc["@comments"].threads.push({
                    id: crypto.randomUUID(),
                    refs: [target],
                    isResolved: false,
                    comments: [
                        { id: crypto.randomUUID(), contactUrl: contact, timestamp: Date.now() },
                    ],
                    "@patchwork": { type: COMMENT_THREAD_TYPE },
                });
            });
        },

        view: (cellId) => (
            <div style={{ display: "flex", "flex-direction": "column", gap: "8px" }}>
                <For each={threadsOn(cellId)}>
                    {(thread) => <ThreadView url={threadUrl(thread)} />}
                </For>
            </div>
        ),

        // Dismissing the popover of a just-added comment shouldn't leave an
        // empty thread behind.
        onClose(cellId) {
            const target = cellUrl(cellId);
            const contact = contactUrl();
            const isEmptyOwnDraft = (comment: Comment) =>
                comment.contactUrl === contact &&
                comment.content === undefined &&
                !comment.draftContent?.trim();
            subHandle().change((doc) => {
                const threads = doc["@comments"]?.threads;
                if (!threads) {
                    return;
                }
                for (let i = threads.length - 1; i >= 0; i--) {
                    const thread = threads[i];
                    if (!thread.refs.includes(target)) {
                        continue;
                    }
                    for (let j = thread.comments.length - 1; j >= 0; j--) {
                        if (isEmptyOwnDraft(thread.comments[j])) {
                            thread.comments.splice(j, 1);
                        }
                    }
                    if (thread.comments.length === 0) {
                        threads.splice(i, 1);
                    }
                }
            });
        },
    };
}

/** A comment thread, shown by Patchwork's `comment-thread` tool. */
function ThreadView(props: { url: AutomergeUrl }) {
    const view = document.createElement("patchwork-view");
    view.setAttribute("tool-id", COMMENT_THREAD_TYPE);
    createEffect(() => view.setAttribute("doc-url", props.url));
    return view;
}
