import type { DocHandle, Prop } from "@automerge/automerge-repo";
import Popover, { type FloatingOptions } from "@corvu/popover";
import GripVertical from "lucide-solid/icons/grip-vertical";
import Plus from "lucide-solid/icons/plus";
import Trash2 from "lucide-solid/icons/trash-2";
import type { EditorView } from "prosemirror-view";
import { type JSX, Show, createEffect, createSignal, onMount } from "solid-js";

import {
    type Completion,
    Completions,
    IconButton,
    InlineInput,
    RichTextEditor,
} from "../components";
import type { CellId } from "./types";

import "./notebook_cell.css";

/** Actions invokable *within* a cell but affecting the larger notebook state.

Through these functions, a cell can request to perform an action on the notebook
or inform the notebook that an action has occcured within the cell.
*/
export type CellActions = {
    // Activate the cell above this one.
    activateAbove: () => void;

    // Activate the cell below this one.
    activateBelow: () => void;

    // Create a new stem cell above this one.
    createAbove: () => void;

    // Create  anew stem cell below this one.
    createBelow: () => void;

    // Delete this cell in the backward/upward direction.
    deleteBackward: () => void;

    // Delete this cell in the forward/downward direction.
    deleteForward: () => void;

    // The cell has received focus.
    hasFocused: () => void;
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
    const visibility = (isVisible: boolean) => (isVisible ? "visible" : "hidden");

    const [isMenuOpen, setMenuOpen] = createSignal(false);
    const openMenu = () => setMenuOpen(true);
    const closeMenu = () => setMenuOpen(false);

    const completions = (): Completion[] => [
        {
            name: "Delete",
            icon: <Trash2 size={16} />,
            onComplete: props.actions.deleteForward,
        },
    ];

    return (
        <div class="cell" onMouseEnter={showGutter} onMouseLeave={hideGutter}>
            <div class="cell-gutter">
                <IconButton
                    onClick={props.actions.createBelow}
                    style={{ visibility: visibility(isGutterVisible()) }}
                >
                    <Plus />
                </IconButton>
                <Popover
                    open={isMenuOpen()}
                    onOpenChange={setMenuOpen}
                    floatingOptions={cellMenuFloatingOptions}
                >
                    <Popover.Anchor as="span">
                        <IconButton
                            onClick={openMenu}
                            style={{ visibility: visibility(isGutterVisible() || isMenuOpen()) }}
                        >
                            <GripVertical />
                        </IconButton>
                    </Popover.Anchor>
                    <Popover.Portal>
                        <Popover.Content class="popup">
                            <Completions completions={completions()} onComplete={closeMenu} />
                        </Popover.Content>
                    </Popover.Portal>
                </Popover>
            </div>
            <div class="cell-content">{props.children}</div>
            <Show when={props.tag}>
                <div class="cell-tag">{props.tag}</div>
            </Show>
        </div>
    );
}

const cellMenuFloatingOptions: FloatingOptions = {
    autoPlacement: {
        allowedPlacements: ["left"],
    },
};

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
