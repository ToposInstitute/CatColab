import type { MarkType } from "prosemirror-model";
import { Plugin, PluginKey } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { type Component, Show, createSignal } from "solid-js";
import { render } from "solid-js/web";

type LinkState = {
    href: string;
    title: string;
    linkStart: number;
    linkEnd: number;
    left: number;
    bottom: number;
};

export function getLinkAtPos(view: EditorView, pos: number): LinkState | null {
    const linkType = view.state.schema.marks.link as MarkType;
    const $pos = view.state.doc.resolve(pos);
    const parent = $pos.parent;

    let href: string;
    let start: number;

    const mark = $pos.marks().find((m) => m.type === linkType);
    if (mark) {
        // the cursor is inside a link
        href = mark.attrs.href;
        start = $pos.parentOffset;
    } else {
        // check if the cursor is at the end of a link
        const childBefore = parent.childBefore($pos.parentOffset);
        if (!childBefore.node) {
            return null;
        }

        const markBefore = childBefore.node.marks.find((mark) => mark.type === linkType);
        if (!markBefore) {
            return null;
        }

        href = markBefore.attrs.href;
        start = childBefore.offset;
    }

    let end = start;

    // search backward to link link start
    while (start > 0) {
        const childBefore = parent.childBefore(start);
        if (!childBefore.node) {
            break;
        }

        const markBefore = childBefore.node.marks.find((mark) => mark.type === linkType);
        if (!markBefore || markBefore.attrs.href !== href) {
            break;
        }

        start = childBefore.offset;
    }

    // search forward to link link end
    while (end < parent.content.size) {
        const childAfter = parent.childAfter(end);
        if (!childAfter.node) {
            break;
        }

        const markAfter = childAfter.node.marks.find((mark) => mark.type === linkType);
        if (!markAfter || markAfter.attrs.href !== href) {
            break;
        }

        end = childAfter.offset + childAfter.node.nodeSize;
    }

    // Convert to absolute document positions
    const linkStart = $pos.start() + start;
    const linkEnd = $pos.start() + end;

    const title = view.state.doc.textBetween(linkStart, linkEnd, "");
    const { left, bottom } = getLinkCoords(view, linkStart);

    return {
        href,
        title,
        linkStart,
        linkEnd,
        left,
        bottom,
    };
}

function getLinkCoords(
    view: EditorView,
    linkPos: number,
): {
    left: number;
    bottom: number;
} {
    const { node, offset } = view.domAtPos(linkPos);
    const linkEl = node.childNodes[offset];

    let linkRect: DOMRect;
    if (linkEl && linkEl.nodeType === Node.ELEMENT_NODE) {
        linkRect = (linkEl as Element).getBoundingClientRect();
    } else {
        console.error("no link element found");
        // Defensive programming. I've never seen this branch used but there are no guarantees that
        // `node.childNodes[offset]` is a link element. The types indicate that `node` may not be an
        // HTML element, however that seems impossible when `linkStart` is in a link.
        //
        // Use the parent of the link as the basis for positioning the editor widget
        linkRect = (node as Element).getBoundingClientRect();
    }

    const editorRect = view.dom.getBoundingClientRect();

    // XXX: I don't understand why the bottom math works, it doesn't make sense to add linkRect.height
    const bottom = linkRect.bottom + linkRect.height - editorRect.top + window.scrollY;
    const left = linkRect.left - editorRect.left + window.scrollX;

    return {
        bottom,
        left,
    };
}

interface LinkEditorWidgetProps {
    view: EditorView;
    linkState: LinkState | null;
    onChange: (attrs: { title: string; href: string }) => void;
}
const LinkEditorWidget: Component<LinkEditorWidgetProps> = (props) => {
    function handleHrefInput(e: InputEvent) {
        if (!props.linkState) {
            return;
        }

        const newHref = (e.currentTarget as HTMLInputElement).value;
        props.onChange({ href: newHref, title: props.linkState.title });
    }

    function handleTitleInput(e: InputEvent) {
        if (!props.linkState) {
            return;
        }

        const newTitle = (e.currentTarget as HTMLInputElement).value;
        if (!newTitle) {
            return;
        }

        props.onChange({ href: props.linkState.href, title: newTitle });
    }

    return (
        <Show when={props.linkState} fallback={null}>
            {(linkState) => (
                <div
                    class="link-editor-popup"
                    style={{
                        position: "absolute",
                        top: `${linkState().bottom + 5}px`,
                        left: `${linkState().left}px`,
                        "z-index": 1,
                    }}
                >
                    <div class="input-field">
                        <div class="label">URL</div>
                        <input type="text" value={linkState().href} onInput={handleHrefInput} />
                    </div>
                    <div class="input-field">
                        <div class="label">Title</div>
                        <input type="text" value={linkState().title} onInput={handleTitleInput} />
                    </div>
                </div>
            )}
        </Show>
    );
};

export function getLinkFromHouseEvent(view: EditorView, event: MouseEvent): LinkState | null {
    // Check to see if the mouse event happened on a link element.
    const target = event.target as HTMLElement | null;
    const linkEl = target?.closest("a[href]") as HTMLAnchorElement | null;
    if (!linkEl) {
        return null;
    }

    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return null;
    }

    const posInfo = view.posAtCoords({ left: event.clientX, top: event.clientY });
    if (!posInfo) {
        return null;
    }

    return getLinkAtPos(view, posInfo.pos);
}

export class LinkEditorView {
    dom: HTMLDivElement;

    hideTimer: number | null = null;
    showTimer: number | null = null;

    handleMouseMove: (e: MouseEvent) => void;
    handleMouseLeave: (e: MouseEvent) => void;

    linkEditorState: () => LinkState | null;
    setLinkEditorState: (state: LinkState | null) => void;

    isLinkHovered = false;

    constructor(private view: EditorView) {
        this.dom = document.createElement("div");
        this.dom.className = "link-editor-container";

        const [linkEditorState, setLinkEditorState] = createSignal<LinkState | null>(null);
        this.linkEditorState = linkEditorState;
        this.setLinkEditorState = setLinkEditorState;

        const container = (this.view.dom.parentElement ?? this.view.dom) as HTMLElement;
        container.appendChild(this.dom);

        // Emulate hover functionality by checking if the mouse is on a link
        this.handleMouseMove = (e: MouseEvent) => {
            const link = getLinkFromHouseEvent(this.view, e);
            if (link) {
                this.scheduleShow(link);
            } else {
                this.scheduleHide();
            }
        };

        this.handleMouseLeave = () => {
            this.scheduleHide();
        };

        this.view.dom.addEventListener("mousemove", this.handleMouseMove);
        this.view.dom.addEventListener("mouseleave", this.handleMouseLeave);

        // Keep popup alive when moving into it
        this.dom.addEventListener("mouseenter", () => this.clearHide());
        this.dom.addEventListener("mouseleave", () => this.scheduleHide());

        // The solid component should only be rendered once. There are problems if it is called multiple
        // times. The solid component will re-render when a signal (from `createSignal`) passed as a prop changes.
        //
        // The solid component should be pure: don't use `createSignal` inside the component. There is
        // no technical reason for this, but update order and state management quickly gets complicated between
        // `this.update` and component signals causing re-renders.
        render(
            () => (
                <LinkEditorWidget
                    view={this.view}
                    linkState={this.linkEditorState()}
                    onChange={this.handleChange.bind(this)}
                />
            ),
            this.dom,
        );
    }

    scheduleShow(link: LinkState) {
        if (this.hideTimer) {
            clearTimeout(this.hideTimer);
            this.hideTimer = null;
        }

        if (this.showTimer) {
            return;
        }

        this.showTimer = window.setTimeout(() => {
            this.setLinkEditorState(link);
            this.isLinkHovered = true;
            this.showTimer = null;
        }, 500);
    }

    scheduleHide() {
        if (this.showTimer) {
            clearTimeout(this.showTimer);
            this.showTimer = null;
        }

        if (this.hideTimer) {
            return;
        }

        this.hideTimer = window.setTimeout(() => {
            this.setLinkEditorState(null);
            this.isLinkHovered = false;
            this.hideTimer = null;
        }, 500);
    }

    clearHide() {
        if (!this.hideTimer) {
            return;
        }

        window.clearTimeout(this.hideTimer);
        this.hideTimer = null;
    }

    handleChange(attrs: { href: string; title: string }) {
        const editorState = this.view.state;
        const linkType = editorState.schema.marks.link as MarkType;

        const linkState = this.linkEditorState();
        if (!linkState) {
            throw new Error("link editor received change with an empyt state");
        }

        const textNode = editorState.schema.text(attrs.title, [
            linkType.create({
                href: attrs.href,
            }),
        ]);

        let tr = editorState.tr;
        tr = tr.replaceRangeWith(linkState.linkStart, linkState.linkEnd, textNode);

        this.view.dispatch(tr);

        // When the link editor is open from hovering, we cannot rely on the state being updated from
        // `this.update`. When `this.update` is run the cursor may be somewhere else in the document,
        // which would cause `this.update` to think that no link is being editted (since it relies on
        // cursor position). To work around this we manually update the state.
        if (!this.isLinkHovered) {
            return;
        }

        const newStart = tr.mapping.map(linkState.linkStart, -1);
        const newEnd = newStart + attrs.title.length;

        this.setLinkEditorState({
            ...linkState,
            href: attrs.href,
            title: attrs.title,
            linkStart: newStart,
            linkEnd: newEnd,
        });
    }

    update() {
        // If the link editor is open from hovering, then any updates are either not relevant to the link
        // being editted or should already be reflected in the link state from `this.handleChange`.
        if (this.isLinkHovered) {
            return;
        }

        // Recreate the link state on every update. This is necessary because the update might be a
        // focus change or jumping from one link to another.
        const linkState = getLinkAtPos(this.view, this.view.state.selection.from);
        this.setLinkEditorState(linkState);
    }

    destroy() {
        this.view.dom.removeEventListener("mousemove", this.handleMouseMove);
        this.view.dom.removeEventListener("mouseleave", this.handleMouseLeave);
        this.dom.remove();
    }
}

export const linkEditorPlugin = new Plugin({
    key: new PluginKey("link-editor"),
    view(editorView) {
        return new LinkEditorView(editorView);
    },
});
