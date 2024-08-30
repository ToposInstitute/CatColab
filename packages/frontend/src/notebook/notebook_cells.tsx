import type { DocHandle, Prop } from "@automerge/automerge-repo";
import type { KbdKey } from "@solid-primitives/keyboard";
import GripVertical from "lucide-solid/icons/grip-vertical";
import type { EditorView } from "prosemirror-view";
import { type JSX, Show, createEffect, createSignal, onMount } from "solid-js";

import { type Completion, IconButton, InlineInput, RichTextEditor } from "../components";
import type { Cell, CellId } from "./types";

/** Actions invokable *within* a cell but affecting the larger notebook state.

Through these functions, a cell can request to perform an action on the notebook
or inform the notebook that an action has occcured within the cell.
*/
export type CellActions = {
    // Activate the cell above this one.
    activateAbove: () => void;

    // Activate the cell below this one.
    activateBelow: () => void;

    // Delete this cell in the backward/upward direction.
    deleteBackward: () => void;

    // Delete this cell in the forward/downward direction.
    deleteForward: () => void;

    // The cell has received focus.
    hasFocused: () => void;
};

/** Constructor of a cell in a notebook.

A notebook knows how to edit cells, but without cell constructors, it wouldn't
know how to create them!
 */
export type CellConstructor<T> = {
    // Name of cell constructor, usually naming the cell type.
    name: string;

    // Tooltip-length description of cell constructor.
    description?: string;

    // Keyboard shortcut to invoke the constructor.
    shortcut?: KbdKey[];

    // Function to construct the cell.
    construct: () => Cell<T>;
};

/** An individual cell in a notebook.

This component contains UI elements common to any cell. The actual content of
the cell is rendered by its children.
 */
export function NotebookCell(props: {
    actions: CellActions;
    children: JSX.Element;
    tag?: string;
}) {
    const [isGutterVisible, setGutterVisible] = createSignal(false);
    const showGutter = () => setGutterVisible(true);
    const hideGutter = () => setGutterVisible(false);
    const gutterVisibility = () => (isGutterVisible() ? "visible" : "hidden");

    return (
        <div class="cell" onMouseEnter={showGutter} onMouseLeave={hideGutter}>
            <div class="cell-gutter">
                <IconButton style={{ visibility: gutterVisibility() }}>
                    <GripVertical />
                </IconButton>
            </div>
            <div class="cell-content">{props.children}</div>
            <Show when={props.tag}>
                <div class="cell-tag">{props.tag}</div>
            </Show>
        </div>
    );
}

/** Editor for rich text cells, a simple wrapper around `RichTextEditor`.
 */
export function RichTextCellEditor(props: {
    cellId: CellId;
    handle: DocHandle<unknown>;
    path: Prop[];
    isActive: boolean;
    actions: CellActions;
}) {
    const [editorView, setEditorView] = createSignal<EditorView>();

    createEffect(() => {
        const view = editorView();
        if (props.isActive && view) {
            view.focus();
        }
    });

    return (
        <RichTextEditor
            ref={(view) => setEditorView(view)}
            id={props.cellId}
            handle={props.handle}
            path={[...props.path, "content"]}
            placeholder="…"
            deleteBackward={props.actions.deleteBackward}
            deleteForward={props.actions.deleteForward}
            exitUp={props.actions.activateAbove}
            exitDown={props.actions.activateBelow}
            onFocus={props.actions.hasFocused}
        />
    );
}

/** Editor for stem cells; cells that have not been differentiated yet.
 */
export function StemCellEditor(props: {
    completions: Completion[];
    isActive: boolean;
    actions: CellActions;
}) {
    const [text, setText] = createSignal("");

    let ref!: HTMLInputElement;

    onMount(() => ref.focus());

    createEffect(() => {
        if (props.isActive) {
            ref.focus();
        }
    });

    return (
        <InlineInput
            ref={ref}
            text={text()}
            setText={setText}
            completions={props.completions}
            deleteBackward={props.actions.deleteBackward}
            deleteForward={props.actions.deleteForward}
            exitUp={props.actions.activateAbove}
            exitDown={props.actions.activateBelow}
            onFocus={props.actions.hasFocused}
            placeholder="Select cell type"
        />
    );
}

/** Interface for editors of cells with formal content.
 */
export type FormalCellEditorProps<T> = {
    content: T;
    changeContent: (f: (content: T) => void) => void;
    isActive: boolean;
    actions: CellActions;
};
