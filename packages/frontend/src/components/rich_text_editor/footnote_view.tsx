import { Node as ProseMirrorNode } from "prosemirror-model";

import { EditorView } from "prosemirror-view";

import { StepMap } from "prosemirror-transform";
import { Show, createResource } from "solid-js";

import type { RefStub } from "catcolab-api";
import { render } from "solid-js/web";
import type { Api } from "../../api";
import { SearchRefs } from "../search_refs";
import { EditorState, Transaction } from "prosemirror-state";

export class FootnoteView {
    dom: HTMLSpanElement;
    node: ProseMirrorNode;
    outerView: EditorView;
    getPos: () => number | undefined;
    refId: string;
    isEditing: boolean;
    innerView: EditorView | null = null;

    // https://prosemirror.net/docs/ref/#view.NodeViewConstructor
    constructor(node: ProseMirrorNode, view: EditorView, getPos: () => number | undefined) {
        this.node = node;
        this.outerView = view;
        this.getPos = getPos;

        this.dom = document.createElement("span");

        this.refId = node.attrs.refid || null;
        this.isEditing = false;

        this.renderSolidComponent();
    }

    renderSolidComponent() {
        this.dom.innerText = "";

        if (this.isEditing) {
            let tooltip = this.dom.appendChild(document.createElement("div"));
            tooltip.className = "footnote-tooltip";
            // And put a sub-ProseMirror into that
            this.innerView = new EditorView(tooltip, {
                // You can use any node as an editor document
                state: EditorState.create({
                    doc: this.node,
                }),
                // This is the magic part
                dispatchTransaction: this.dispatchInner.bind(this),
                handleDOMEvents: {
                    mousedown: () => {
                        // Kludge to prevent issues due to the fact that the whole
                        // footnote is node-selected (and thus DOM-selected) when
                        // the parent editor is focused.
                        if (this.outerView.hasFocus()) this.innerView!.focus();
                    },
                },
            });
        } else {
            render(
                () => (
                    <RefIdWidget
                        refId={this.refId}
                        updateRefId={(refId) => this.updateRefId(refId)}
                        isEditing={this.isEditing}
                        cancelEditing={() => this.cancelEditing()}
                    />
                ),
                this.dom,
            );
        }
    }

    cancelEditing() {
        this.isEditing = false;
        this.renderSolidComponent();
    }

    dispatchInner(tr: Transaction) {
        if (!this.innerView) {
            return;
        }

        let { state, transactions } = this.innerView.state.applyTransaction(tr);
        this.innerView.updateState(state);

        if (!tr.getMeta("fromOutside")) {
            let outerTr = this.outerView.state.tr,
                offsetMap = StepMap.offset(this.getPos()! + 1);
            for (let i = 0; i < transactions.length; i++) {
                let steps = transactions[i]!.steps;
                for (let j = 0; j < steps.length; j++) outerTr.step(steps[j]!.map(offsetMap)!);
            }
            if (outerTr.docChanged) this.outerView.dispatch(outerTr);
        }
    }

    updateRefId(refId: string) {
        const pos = this.getPos();
        if (typeof pos !== "number") {
            return;
        }

        this.outerView.dispatch(
            this.outerView.state.tr.setNodeMarkup(pos, undefined, {
                ...this.node.attrs,
                refid: refId,
            }),
        );

        this.isEditing = false;
        this.renderSolidComponent();
    }

    // update(node: ProseMirrorNode) {
    //     if (node.attrs.refid !== this.node.attrs.refid) {
    //         console.log("Node refId changed, re-rendering", node.attrs.refid);
    //         this.node = node;
    //         this.refId = this.node.attrs.refid;
    //         this.renderSolidComponent();
    //     }
    //     return true;
    update(node: ProseMirrorNode) {
        if (!node.sameMarkup(this.node)) return false;
        this.node = node;
        if (this.innerView) {
            let state = this.innerView.state;
            let start = node.content.findDiffStart(state.doc.content);
            if (start != null) {
                let { a: endA, b: endB } = node.content.findDiffEnd(state.doc.content);
                let overlap = start - Math.min(endA, endB);
                if (overlap > 0) {
                    endA += overlap;
                    endB += overlap;
                }
                this.innerView.dispatch(
                    state.tr
                        .replace(start, endB, node.slice(start, endA))
                        .setMeta("fromOutside", true),
                );
            }
        }
        return true;
    }

    selectNode() {
        this.isEditing = true;
        this.renderSolidComponent();
    }

    deselectNode() {
        this.innerView = null;
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
}) => {
    // const handleRefSelected = (refStub: RefStub) => {
    //     props.updateRefId(refStub.ref_id);
    // };

    // const fetchRefStub = async (refId: string | null) => {
    //     if (!refId) return null;
    //     const response = await props.api.rpc.get_ref_stub.query(refId);
    //     if (response.tag === "Ok") return response.content;
    //     throw new Error(response.message);
    // };

    // const [refStub] = createResource(() => props.refId, fetchRefStub);

    // if (props.isEditing) {
    //     return (
    //         <SearchRefs
    //             initialQuery={refStub()?.name || null}
    //             focusOnFirstRender={true}
    //             endpoint={props.api.rpc.get_ref_stubs}
    //             onRefSelected={handleRefSelected}
    //             onCancel={props.cancelEditing}
    //         />
    //     );
    // }

    // if (props.refId === null) {
    return <span class="ref-id-view">No ref set </span>;
    // }

    // return (
    //     <Show when={!refStub.loading} fallback={<span>Loading...</span>}>
    //         <Show
    //             when={!refStub.error}
    //             fallback={<span class="error ref-id-view">Error: {refStub.error?.message}</span>}
    //         >
    //             <Show
    //                 when={refStub()}
    //                 keyed
    //                 fallback={
    //                     <span class="error ref-id-view">
    //                         Error: Could not load reference {props.refId}
    //                     </span>
    //                 }
    //             >
    //                 {(stub) => (
    //                     <span class="catcolabrefid ref-id-view" {...{ catcolabrefid: props.refId }}>
    //                         {stub.name}
    //                     </span>
    //                 )}
    //             </Show>
    //         </Show>
    //     </Show>
    // );
};
