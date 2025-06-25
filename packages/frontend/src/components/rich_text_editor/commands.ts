import type { NodeType } from "prosemirror-model";
import { type Command, type EditorState, NodeSelection, type Transaction } from "prosemirror-state";
import { hasContent } from "./utils";
import { sinkListItem, wrapInList } from "prosemirror-schema-list";
import { chainCommands } from "prosemirror-commands";

export function insertMathDisplayCmd(nodeType: NodeType, initialText = ""): Command {
    return (state: EditorState, dispatch: ((tr: Transaction) => void) | undefined) => {
        const { $from, $to } = state.selection;

        if (!dispatch) {
            return true;
        }

        // There is an idiomatic pattern at the start of commands inserting new nodes to check that the node can
        // be inserted with canReplaceWith. In this case we skip the check because canReplaceWith will
        // always (I think) fail when trying to put a block inside a paragraph.

        const selectedText = state.doc.textBetween($from.pos, $to.pos, " ");
        const initialTextContent = initialText || selectedText;
        const initialContent = initialTextContent ? state.schema.text(initialTextContent) : null;

        const mathNode = nodeType.create({}, initialContent);

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
}

// Currently does not work due to bug in the automerge-prosemirror plugin. (It also might not work in
// general, but it theoretically should)
export function insertMathInlineCmd(mathNodeType: NodeType, initialText = ""): Command {
    return (state: EditorState, dispatch: ((tr: Transaction) => void) | undefined) => {
        const { $from } = state.selection;
        const index = $from.index();
        if (!$from.parent.canReplaceWith(index, index, mathNodeType)) {
            return false;
        }

        if (dispatch) {
            const mathNode = mathNodeType.create(
                {},
                initialText ? state.schema.text(initialText) : null,
            );

            let tr = state.tr.replaceSelectionWith(mathNode);
            tr = tr.setSelection(NodeSelection.create(tr.doc, $from.pos));

            dispatch(tr);
        }

        return true;
    };
}

export function increaseListIndet(listItemNode: NodeType): Command {
    return (state: EditorState, dispatch: ((tr: Transaction) => void) | undefined) => {
        // If we're in a list, figure out what kind it is
        const { $from } = state.selection;
        let listNode = null;
        for (let i = $from.depth; i > 0; i--) {
            if ($from.node(i).type.name === listItemNode.name) {
                listNode = $from.node(i - 1);
                break;
            }
        }

        if (!listNode) {
            return false;
        }

        return chainCommands(sinkListItem(listItemNode), wrapInList(listNode.type))(
            state,
            dispatch,
        );
    };
}

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
