import { chainCommands, wrapIn } from "prosemirror-commands";
import type { MarkType } from "prosemirror-model";
import { type EditorState, Plugin, type Transaction } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import type { CustomSchema } from "./schema";

import { liftListItem, sinkListItem, wrapInList } from "prosemirror-schema-list";

export function turnSelectionIntoBlockquote(
    state: EditorState,
    dispatch: ((tr: Transaction) => void) | undefined,
    view: EditorView,
): boolean {
    // Check if the blockquote can be applied
    const { $from, $to } = state.selection;
    const range = $from.blockRange($to);

    if (!range) {
        return false;
    }

    const schema = state.schema as CustomSchema;

    // Check if we can wrap the selection in a blockquote
    if (!wrapIn(schema.nodes.blockquote)(state, undefined, view)) {
        return false;
    }

    // Apply the blockquote transformation
    if (dispatch) {
        wrapIn(schema.nodes.blockquote)(state, dispatch, view);
    }

    return true;
}

export function toggleOrderedList(view: EditorView): void {
    if (!view) {
        return;
    }

    const schema = view.state.schema as CustomSchema;

    wrapInList(schema.nodes.bullet_list)(view.state, view.dispatch, view);
}

export function toggleNumberedList(view: EditorView): void {
    if (!view) {
        return;
    }

    const schema = view.state.schema as CustomSchema;

    wrapInList(schema.nodes.ordered_list)(view.state, view.dispatch, view);
}

export function decreaseIndent(view: EditorView): void {
    if (!view) {
        return;
    }

    const schema = view.state.schema as CustomSchema;

    liftListItem(schema.nodes.list_item)(view.state, view.dispatch, view);
}

export function hasContent(state: EditorState): boolean {
    const doc = state.doc;
    return !!doc.textContent || (!!doc.firstChild && doc.firstChild.content.size > 0);
}

/** Placeholder text plugin for ProseMirror.

Source:

- https://discuss.prosemirror.net/t/how-to-input-like-placeholder-behavior/705
- https://gist.github.com/amk221/1f9657e92e003a3725aaa4cf86a07cc0
 */
export function initPlaceholderPlugin(text: string) {
    const update = (view: EditorView) => {
        const isEmpty = !hasContent(view.state);
        const isFocused = view.hasFocus();

        if (isEmpty && !isFocused) {
            view.dom.setAttribute("data-placeholder", text);
        } else {
            view.dom.removeAttribute("data-placeholder");
        }
    };

    return new Plugin({
        view(view) {
            update(view);

            const handleUpdate = () => update(view);

            view.dom.addEventListener("focus", handleUpdate);
            view.dom.addEventListener("blur", handleUpdate);

            return {
                update: handleUpdate,
                destroy() {
                    view.dom.removeEventListener("focus", handleUpdate);
                    view.dom.removeEventListener("blur", handleUpdate);
                },
            };
        },
    });
}

// returns the number of the heading style used in the current selection
export function activeHeading(state: EditorState, schema: CustomSchema): number | null {
    const parent = state.selection.$from.parent;

    if (parent.type === schema.nodes.heading) {
        return parent.attrs.level;
    }

    return null;
}

export function isMarkActive(state: EditorState, type: MarkType) {
    const { from, $from, to, empty } = state.selection;
    if (empty) {
        return !!type.isInSet(state.storedMarks || $from.marks());
    } else {
        return state.doc.rangeHasMark(from, to, type);
    }
}
