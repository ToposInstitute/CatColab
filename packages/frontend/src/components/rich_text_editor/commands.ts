import { chainCommands, wrapIn } from "prosemirror-commands";
import { liftListItem, sinkListItem, wrapInList } from "prosemirror-schema-list";
import { type Command, NodeSelection, type Transaction } from "prosemirror-state";

import type { CustomSchema } from "./schema";
import { hasContent } from "./utils";

export const insertMathDisplayCmd: Command = (state, dispatch) => {
    const schema = state.schema as CustomSchema;
    const { $from, $to } = state.selection;

    // There is an idiomatic pattern at the start of commands inserting new nodes to check that the node can
    // be inserted with canReplaceWith. In this case we skip the check because canReplaceWith will
    // always (I think) fail when trying to put a block inside a paragraph.
    if (!dispatch) {
        return true;
    }

    const selectedText = state.doc.textBetween($from.pos, $to.pos, " ");
    const initialContent = selectedText ? state.schema.text(selectedText) : null;
    const mathNode = schema.nodes.math_display.create({}, initialContent);

    let tr = state.tr;

    // delete the selected text (it will be replaced with `initalContent`)
    if ($from.pos !== $to.pos) {
        tr = tr.delete($from.pos, $to.pos);
    }

    // if we're inside a paragraph, split the paragraph
    if ($from.parent.type.name === "paragraph" && $from.parent.content.size !== 0) {
        tr = tr.split($from.pos);
    }

    tr = tr.insert($from.pos, mathNode);
    tr = tr.setSelection(NodeSelection.create(tr.doc, $from.pos + 1));

    dispatch(tr);

    return true;
};

export const insertLinkCmd: Command = (state, dispatch) => {
    if (!dispatch) {
        return true;
    }

    const schema = state.schema as CustomSchema;
    const linkMark = schema.marks.link.create({ href: "" });
    const { from, to } = state.selection;

    let tr = state.tr;
    if (state.selection.empty) {
        const textNode = schema.text("link", [linkMark]);
        tr = tr.replaceSelectionWith(textNode, false);
    } else {
        tr = tr.addMark(from, to, linkMark);
    }

    dispatch(tr);

    return true;
};

// Currently does not work due to bug in the automerge-prosemirror plugin. (It also might not work in
// general, but it theoretically should)
// copied from: https://github.com/benrbray/prosemirror-math/blob/master/lib/commands/insert-math-cmd.ts
export const insertMathInlineCmd: Command = (state, dispatch) => {
    const schema = state.schema as CustomSchema;
    const { $from } = state.selection;
    const index = $from.index();
    if (!$from.parent.canReplaceWith(index, index, schema.nodes.math_display)) {
        return false;
    }

    if (dispatch) {
        const mathNode = schema.nodes.math_display.create({}, null);

        let tr = state.tr.replaceSelectionWith(mathNode);
        tr = tr.setSelection(NodeSelection.create(tr.doc, $from.pos));

        dispatch(tr);
    }

    return true;
};

export const increaseListIndet: Command = (state, dispatch, view) => {
    const schema = state.schema as CustomSchema;

    // If we're in a list, figure out what kind it is
    const { $from } = state.selection;
    let listNode = null;
    for (let i = $from.depth; i > 0; i--) {
        if ($from.node(i).type.name === schema.nodes.list_item.name) {
            listNode = $from.node(i - 1);
            break;
        }
    }

    if (!listNode) {
        return false;
    }

    return chainCommands(sinkListItem(schema.nodes.list_item), wrapInList(listNode.type))(
        state,
        dispatch,
        view,
    );
};

export const toggleBulletList: Command = (state, dispatch, view) => {
    const schema = state.schema as CustomSchema;
    return wrapInList(schema.nodes.bullet_list)(state, dispatch, view);
};

export const toggleOrderedList: Command = (state, dispatch, view) => {
    const schema = state.schema as CustomSchema;
    return wrapInList(schema.nodes.ordered_list)(state, dispatch, view);
};

export const decreaseIndent: Command = (state, dispatch, view) => {
    const schema = state.schema as CustomSchema;
    return liftListItem(schema.nodes.list_item)(state, dispatch, view);
};

export const turnSelectionIntoBlockquote: Command = (state, dispatch, view) => {
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
};

/** ProseMirror command invoked if the document is empty.
 */
export function doIfEmpty(callback: (dispatch: (tr: Transaction) => void) => void): Command {
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
export function doIfAtTop(callback: (dispatch: (tr: Transaction) => void) => void): Command {
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
export function doIfAtBottom(callback: (dispatch: (tr: Transaction) => void) => void): Command {
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
