import type { Node as ProseMirrorNode } from "prosemirror-model";

import type { EditorView } from "prosemirror-view";

import { Show, createResource } from "solid-js";

import type { RefStub } from "catcolab-api";
import { render } from "solid-js/web";
import type { Api } from "../../api";
import { SearchRefs } from "../search_refs";

export class RefIdView {
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
                <RefIdWidget
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

const RefIdWidget = (props: {
    refId: string | null;
    updateRefId: (refId: string) => void;
    cancelEditing: () => void;
    isEditing: boolean;
    api: Api;
}) => {
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
        return <span class="ref-id-view">No ref set </span>;
    }

    return (
        <Show when={!refStub.loading} fallback={<span>Loading...</span>}>
            <Show
                when={!refStub.error}
                fallback={<span class="error ref-id-view">Error: {refStub.error?.message}</span>}
            >
                <Show
                    when={refStub()}
                    keyed
                    fallback={
                        <span class="error ref-id-view">
                            Error: Could not load reference {props.refId}
                        </span>
                    }
                >
                    {(stub) => (
                        <span class="catcolabrefid ref-id-view" {...{ catcolabrefid: props.refId }}>
                            {stub.name}
                        </span>
                    )}
                </Show>
            </Show>
        </Show>
    );
};
