import type { Prop } from "@automerge/automerge";
import type { DocHandle } from "@automerge/automerge-repo";

import { SchemaAdapter, basicSchemaAdapter, init } from "@automerge/prosemirror";
import { baseKeymap, toggleMark } from "prosemirror-commands";
import { keymap } from "prosemirror-keymap";
import type { Node as ProseMirrorNode, Schema } from "prosemirror-model";
import { type Command, EditorState, Plugin, type Transaction } from "prosemirror-state";
import { EditorView } from "prosemirror-view";

import { Show, createEffect, createResource, createSignal, onCleanup, onMount } from "solid-js";
import { useDocHandleReady } from "../api/document";

import "prosemirror-view/style/prosemirror.css";
import "./rich_text_editor.css";
import { instance } from "@viz-js/viz";
import type { RefStub } from "catcolab-api";
import { render } from "solid-js/web";
import { type Api, useApi } from "../api";
import { basicSchema } from "./basic_schema";
import { SearchRefs } from "./search_refs";

/** Optional props for `RichTextEditor` component.
 */
export type RichTextEditorOptions = {
    id?: unknown;
    ref?: (ref: EditorView) => void;
    placeholder?: string;

    deleteBackward?: () => void;
    deleteForward?: () => void;
    exitUp?: () => void;
    exitDown?: () => void;

    onFocus?: () => void;
};

/** Rich text editor combining Automerge and ProseMirror.

Adapted from:

- https://github.com/automerge/prosemirror-quickstart/
- https://github.com/automerge/automerge-prosemirror/tree/main/playground/
 */
export const RichTextEditor = (
    props: {
        handle: DocHandle<unknown>;
        path: Prop[];
    } & RichTextEditorOptions,
) => {
    let editorRoot!: HTMLDivElement;

    const api = useApi();
    const isReady = useDocHandleReady(() => props.handle);

    createEffect(() => {
        // NOTE: Make the effect depend on the given ID to ensure that this
        // component updates when the Automerge handle and path both stay the
        // same but the path refers to a different object in the document.
        props.id;

        if (!isReady()) {
            return;
        }

        const customSchemaAdapter = new SchemaAdapter(basicSchema);

        const { schema, pmDoc, plugin } = init(props.handle, props.path, {
            schemaAdapter: customSchemaAdapter,
        });

        // biome-ignore lint/style/noNonNullAssertion: it's defined in basicSchema. This could/should theoretically be typed correctly
        const catcolabrefType = schema.nodes.catcolabref!;

        function insertCatcolabRef(): Command {
            return (state, dispatch) => {
                const { $from } = state.selection;
                const index = $from.index();
                if (!$from.parent.canReplaceWith(index, index, catcolabrefType)) {
                    return false;
                }
                if (dispatch) {
                    dispatch(state.tr.replaceSelectionWith(catcolabrefType.create()));
                }
                return true;
            };
        }

        const km = richTextEditorKeymap(schema, props);
        km["Alt-r"] = insertCatcolabRef();
        km["Mod-r"] = insertCatcolabRef();

        const plugins: Plugin[] = [
            keymap(km),
            keymap(baseKeymap),
            ...(props.placeholder ? [placeholder(props.placeholder)] : []),
            plugin,
        ];

        const view = new EditorView(editorRoot, {
            state: EditorState.create({ schema, plugins, doc: pmDoc }),
            dispatchTransaction: (tx: Transaction) => {
                // XXX: It appears that automerge-prosemirror can dispatch
                // transactions even after the view has been destroyed.
                !view.isDestroyed && view.updateState(view.state.apply(tx));
            },
            handleDOMEvents: {
                focus: () => {
                    props.onFocus?.();
                    return false;
                },
            },
            nodeViews: {
                catcolabref(node, view, getPos) {
                    return new RefView(node, view, getPos, api);
                },
            },
        });
        if (props.ref) {
            props.ref(view);
        }

        onCleanup(() => view.destroy());
    });

    return <div class="rich-text-editor" ref={editorRoot} />;
};

interface CustomNodeProps {
    refId: string | null;
    updateRefId: (refId: string) => void;
    cancelEditing: () => void;
    isEditing: boolean;
    api: Api;
}

const CustomNodeComponent = (props: CustomNodeProps) => {
    const handleRefSelected = (refStub: RefStub) => {
        props.updateRefId(refStub.ref_id);
    };

    const fetchRefStub = async (refId: string | null) => {
        if (!refId) return null;
        const response = await props.api.rpc.get_ref_stub.query(refId);
        if (response.tag === "Ok") return response.content;
        throw new Error(response.message);
    };

    const [refStub] = createResource(() => props.refId, fetchRefStub);

    if (props.isEditing) {
        return (
            <SearchRefs
                initialQuery={refStub()?.name || null}
                focusOnFirstRender={true}
                endpoint={props.api.rpc.get_ref_stubs}
                onRefSelected={handleRefSelected}
                onCancel={props.cancelEditing}
            />
        );
    }

    if (props.refId === null) {
        return <span>No ref set </span>;
    }

    return (
        <Show when={!refStub.loading} fallback={<span>Loading...</span>}>
            <Show
                when={!refStub.error}
                fallback={<span class="error">Error: {refStub.error?.message}</span>}
            >
                <Show
                    when={refStub()}
                    keyed
                    fallback={
                        <span class="error">Error: Could not load reference {props.refId}</span>
                    }
                >
                    {(stub) => (
                        <span class="catcolabrefid" {...{ catcolabrefid: props.refId }}>
                            {stub.name}
                        </span>
                    )}
                </Show>
            </Show>
        </Show>
    );
};

class RefView {
    dom: HTMLSpanElement;
    node: ProseMirrorNode;
    view: EditorView;
    getPos: () => number | undefined;
    refId: string;
    isEditing: boolean;
    api: Api;

    // https://prosemirror.net/docs/ref/#view.NodeViewConstructor
    constructor(
        node: ProseMirrorNode,
        view: EditorView,
        getPos: () => number | undefined,
        api: Api,
    ) {
        this.node = node;
        this.view = view;
        this.getPos = getPos;
        this.api = api;

        this.dom = document.createElement("span");

        this.refId = node.attrs.refid || null;
        this.isEditing = false;

        this.renderSolidComponent();
    }

    renderSolidComponent() {
        this.dom.innerText = "";
        render(
            () => (
                <CustomNodeComponent
                    refId={this.refId}
                    updateRefId={(refId) => this.updateRefId(refId)}
                    isEditing={this.isEditing}
                    api={this.api}
                    cancelEditing={() => this.cancelEditing()}
                />
            ),
            this.dom,
        );
    }

    cancelEditing() {
        this.isEditing = false;
        this.renderSolidComponent();
    }

    updateRefId(refId: string) {
        const pos = this.getPos();
        if (typeof pos !== "number") {
            return;
        }

        this.view.dispatch(
            this.view.state.tr.setNodeMarkup(pos, undefined, {
                ...this.node.attrs,
                refid: refId,
            }),
        );

        this.isEditing = false;
        this.renderSolidComponent();
    }

    update(node: ProseMirrorNode) {
        if (node.attrs.refid !== this.node.attrs.refid) {
            console.log("Node refId changed, re-rendering", node.attrs.refid);
            this.node = node;
            this.refId = this.node.attrs.refid;
            this.renderSolidComponent();
        }
        return true;
    }

    selectNode() {
        this.isEditing = true;
        this.renderSolidComponent();
    }

    deselectNode() {
        this.isEditing = false;
        this.renderSolidComponent();
    }

    stopEvent(event: Event) {
        if (!event.target || !(event.target instanceof Node)) {
            return false;
        }

        return this.dom.contains(event.target);
    }

    destroy() {
        this.dom.innerHTML = "";
    }
}

function richTextEditorKeymap(schema: Schema, props: RichTextEditorOptions) {
    const bindings: { [key: string]: Command } = {};
    if (schema.marks.strong) {
        bindings["Mod-b"] = toggleMark(schema.marks.strong);
    }
    if (schema.marks.em) {
        bindings["Mod-i"] = toggleMark(schema.marks.em);
    }
    if (props.deleteBackward) {
        bindings["Backspace"] = doIfEmpty(props.deleteBackward);
    }
    if (props.deleteForward) {
        bindings["Delete"] = doIfEmpty(props.deleteForward);
    }
    if (props.exitUp) {
        bindings["ArrowUp"] = doIfAtTop(props.exitUp);
    }
    if (props.exitDown) {
        bindings["ArrowDown"] = doIfAtBottom(props.exitDown);
    }
    return bindings;
}

/** ProseMirror command invoked if the document is empty.
 */
function doIfEmpty(callback: (dispatch: (tr: Transaction) => void) => void): Command {
    return (state, dispatch?) => {
        if (hasContent(state)) {
            return false;
        }
        dispatch && callback(dispatch);
        return true;
    };
}

/** ProseMirror command invoked if the cursor is at the top of the document.
 */
function doIfAtTop(callback: (dispatch: (tr: Transaction) => void) => void): Command {
    return (state, dispatch?, view?) => {
        const sel = state.selection;
        if (
            !(
                sel.empty &&
                sel.$anchor.parent === state.doc.firstChild &&
                view &&
                view.endOfTextblock("up")
            )
        ) {
            return false;
        }
        dispatch && callback(dispatch);
        return true;
    };
}

/** ProseMirror command invoked if the cursor is at the bottom of the document.
 */
function doIfAtBottom(callback: (dispatch: (tr: Transaction) => void) => void): Command {
    return (state, dispatch?, view?) => {
        const sel = state.selection;
        if (
            !(
                sel.empty &&
                sel.$anchor.parent === state.doc.lastChild &&
                view &&
                view.endOfTextblock("down")
            )
        ) {
            return false;
        }
        dispatch && callback(dispatch);
        return true;
    };
}

/** Placeholder text plugin for ProseMirror.

Source:

- https://discuss.prosemirror.net/t/how-to-input-like-placeholder-behavior/705
- https://gist.github.com/amk221/1f9657e92e003a3725aaa4cf86a07cc0
 */
function placeholder(text: string) {
    const update = (view: EditorView) => {
        if (hasContent(view.state)) {
            view.dom.removeAttribute("data-placeholder");
        } else {
            view.dom.setAttribute("data-placeholder", text);
        }
    };

    return new Plugin({
        view(view) {
            update(view);

            return { update };
        },
    });
}

const hasContent = (state: EditorState) => {
    const doc = state.doc;
    return doc.textContent || (doc.firstChild && doc.firstChild.content.size > 0);
};
