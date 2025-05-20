import { wrapIn } from "prosemirror-commands";
import { NodeType } from "prosemirror-model";
import { Command, EditorState, NodeSelection, Transaction } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { CustomSchema } from "./schema";

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
        if ($from.pos !== $to.pos) {
            tr = tr.delete($from.pos, $to.pos);
        }

        if ($from.parent.type.name === "paragraph" && $from.parent.content.size !== 0) {
            tr = tr.split($from.pos);
        }

        tr = tr.insert($from.pos, mathNode);
        tr = tr.setSelection(NodeSelection.create(tr.doc, $from.pos + 1));

        dispatch(tr);

        return true;
    };
}

export function turnSelectionIntoBlockquote(
    state: EditorState,
    dispatch: (tr: Transaction) => void | undefined,
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
