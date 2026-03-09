import katex from "katex";
import type { Node } from "prosemirror-model";
import { TextSelection } from "prosemirror-state";
import type { EditorView, NodeView } from "prosemirror-view";

export class MathInlineView implements NodeView {
    dom: HTMLElement;
    private renderEl: HTMLSpanElement;
    private srcEl: HTMLSpanElement;
    private input: HTMLInputElement | null = null;
    private node: Node;
    private view: EditorView;
    private getPos: () => number | undefined;
    private editing = false;

    constructor(node: Node, view: EditorView, getPos: () => number | undefined) {
        this.node = node;
        this.view = view;
        this.getPos = getPos;

        this.dom = document.createElement("math-inline") as HTMLElement;
        this.dom.classList.add("math-node");

        this.renderEl = document.createElement("span");
        this.renderEl.classList.add("math-render");
        this.dom.appendChild(this.renderEl);

        this.srcEl = document.createElement("span");
        this.srcEl.classList.add("math-src");
        this.dom.appendChild(this.srcEl);

        this.renderKatex();
    }

    private renderKatex() {
        const tex = this.node.attrs.tex || "";
        this.renderEl.innerHTML = "";
        if (tex) {
            try {
                katex.render(tex, this.renderEl, { displayMode: false, throwOnError: false });
            } catch {
                this.renderEl.textContent = tex;
            }
            this.dom.classList.remove("empty-math");
        } else {
            this.dom.classList.add("empty-math");
        }
    }

    selectNode() {
        this.dom.classList.add("ProseMirror-selectednode");
        this.editing = true;

        this.input = document.createElement("input");
        this.input.type = "text";
        this.input.className = "math-input";
        this.input.value = this.node.attrs.tex || "";

        const updateWidth = () => {
            if (this.input) {
                this.input.style.width = `${Math.max(2, this.input.value.length + 1)}ch`;
            }
        };
        this.input.addEventListener("input", updateWidth);

        this.input.addEventListener("keydown", (e: KeyboardEvent) => {
            if (e.key === "Enter") {
                e.preventDefault();
                this.saveAndExit();
            } else if (e.key === "Escape") {
                e.preventDefault();
                this.revert();
            } else if (e.key === "Backspace" && this.input && this.input.value === "") {
                e.preventDefault();
                this.deleteNode();
            } else if (e.key === "ArrowLeft" && this.input?.selectionStart === 0) {
                e.preventDefault();
                this.saveAndExitTo("before");
            } else if (
                e.key === "ArrowRight" &&
                this.input?.selectionStart === this.input?.value.length
            ) {
                e.preventDefault();
                this.saveAndExit();
            }
        });

        this.input.addEventListener("blur", () => {
            if (this.editing) {
                this.saveValue();
                this.editing = false;
                this.renderKatex();
                this.dom.classList.remove("ProseMirror-selectednode");
                this.cleanupInput();
            }
        });

        this.srcEl.innerHTML = "";
        this.srcEl.appendChild(this.input);
        updateWidth();
        this.input.focus();
    }

    deselectNode() {
        const wasEditing = this.editing;
        this.editing = false;
        if (wasEditing) {
            this.saveValue();
            this.renderKatex();
        }
        this.dom.classList.remove("ProseMirror-selectednode");
        this.cleanupInput();
    }

    private saveAndExit() {
        this.saveAndExitTo("after");
    }

    private saveAndExitTo(side: "before" | "after") {
        this.saveValue();
        this.editing = false;
        this.renderKatex();
        this.dom.classList.remove("ProseMirror-selectednode");
        this.cleanupInput();

        const pos = this.getPos();
        if (typeof pos === "number") {
            const targetPos = side === "before" ? pos : pos + this.node.nodeSize;
            const $pos = this.view.state.doc.resolve(targetPos);
            const tr = this.view.state.tr.setSelection(
                TextSelection.create(this.view.state.doc, $pos.pos),
            );
            this.view.dispatch(tr);
        }
        this.view.focus();
    }

    private revert() {
        this.editing = false;
        this.dom.classList.remove("ProseMirror-selectednode");
        this.cleanupInput();
        this.view.focus();
    }

    private saveValue() {
        if (!this.input) {
            return;
        }
        const newTex = this.input.value;
        if (newTex === this.node.attrs.tex) {
            return;
        }

        const pos = this.getPos();
        if (typeof pos !== "number") {
            return;
        }

        this.view.dispatch(this.view.state.tr.setNodeMarkup(pos, null, { tex: newTex }));
    }

    private deleteNode() {
        const pos = this.getPos();
        if (typeof pos !== "number") {
            return;
        }
        this.editing = false;
        this.view.dispatch(this.view.state.tr.delete(pos, pos + this.node.nodeSize));
        this.view.focus();
    }

    private cleanupInput() {
        this.input = null;
        this.srcEl.innerHTML = "";
    }

    update(node: Node): boolean {
        if (node.type !== this.node.type) {
            return false;
        }
        this.node = node;
        if (!this.editing) {
            this.renderKatex();
        }
        return true;
    }

    stopEvent(): boolean {
        return this.editing;
    }

    ignoreMutation(): boolean {
        return true;
    }

    destroy() {
        this.dom.remove();
    }
}
