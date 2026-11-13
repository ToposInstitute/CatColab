import type { AutomergeUrl, DocHandle, Repo } from "@automerge/automerge-repo";
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
    element: HTMLElement & { repo: Repo },
    handle: Accessor<DocHandle<unknown>>,
    doc: Accessor<object>,
): NotebookComments {
    const [contactUrl, setContactUrl] = createSignal<AutomergeUrl>();
    onCleanup(subscribe<AutomergeUrl>(element, { type: "patchwork:contact" }, setContactUrl));
    const focus = createPatchworkFocus(element);
    const [ownSelection, setOwnSelection] = createSignal<string>();

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

        // A cell is highlighted when a thread on it is hovered or selected in
        // the comments sidebar, but not when the sidebar is only echoing the
        // cell that has focus here.
        isHighlighted(cellId) {
            const url = cellUrl(cellId);
            return (
                focus.highlighted().has(url) &&
                !(ownSelection() === url && focus.selected() === url)
            );
        },

        // The cell being edited is Patchwork's selection while it has focus, so
        // the comments sidebar picks out its threads.
        select(cellId, selected) {
            const url = cellUrl(cellId);
            if (selected) {
                setOwnSelection(url);
            } else if (ownSelection() === url) {
                setOwnSelection(undefined);
            }
            focus.handle()?.change((focusDoc) => {
                const isSelected = Object.keys(focusDoc.selection ?? {}).join(" ") === url;
                if (selected && !isSelected) {
                    focusDoc.selection = { [url]: true };
                } else if (!selected && isSelected) {
                    focusDoc.selection = {};
                }
            });
        },
    };
}

/** Patchwork's shared record of where the user's attention is.

`selection` is owned by the active editor; `highlight` is emphasis added by
other views, such as the comments sidebar while a thread is hovered.
 */
type FocusDoc = {
    selection: Record<AutomergeUrl, true>;
    highlight: Record<AutomergeUrl, true>;
};

/** The focus document, the URLs it highlights, and its selection (the URLs
joined by spaces). */
function createPatchworkFocus(element: HTMLElement & { repo: Repo }) {
    const [handle, setHandle] = createSignal<DocHandle<FocusDoc>>();
    onCleanup(
        subscribe<AutomergeUrl>(element, { type: "patchwork:focus" }, (url) => {
            void element.repo.find<FocusDoc>(url).then(setHandle);
        }),
    );

    const [highlighted, setHighlighted] = createSignal<ReadonlySet<string>>(new Set());
    const [selected, setSelected] = createSignal("");
    createEffect(() => {
        const focusHandle = handle();
        if (!focusHandle) {
            return;
        }
        const update = () => {
            const focusDoc = focusHandle.doc();
            setHighlighted(new Set(Object.keys(focusDoc?.highlight ?? {})));
            setSelected(Object.keys(focusDoc?.selection ?? {}).join(" "));
        };
        update();
        focusHandle.on("change", update);
        onCleanup(() => focusHandle.off("change", update));
    });

    return { handle, highlighted, selected };
}

/** A comment thread, shown by Patchwork's `comment-thread` tool. */
function ThreadView(props: { url: AutomergeUrl }) {
    const view = document.createElement("patchwork-view");
    view.setAttribute("tool-id", COMMENT_THREAD_TYPE);
    createEffect(() => view.setAttribute("doc-url", props.url));
    return view;
}
