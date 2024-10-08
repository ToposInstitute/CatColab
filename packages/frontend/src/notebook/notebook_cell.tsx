import { attachClosestEdge } from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import {
    draggable,
    dropTargetForElements,
} from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import type { DocHandle, Prop } from "@automerge/automerge-repo";
import Popover from "@corvu/popover";
import type { EditorView } from "prosemirror-view";
import { type JSX, Show, createEffect, createSignal, onCleanup, onMount } from "solid-js";

import {
    type Completion,
    Completions,
    IconButton,
    InlineInput,
    RichTextEditor,
} from "../components";
import type { CellId } from "./types";

import ArrowDown from "lucide-solid/icons/arrow-down";
import ArrowUp from "lucide-solid/icons/arrow-up";
import Copy from "lucide-solid/icons/copy";
import GripVertical from "lucide-solid/icons/grip-vertical";
import Plus from "lucide-solid/icons/plus";
import Trash2 from "lucide-solid/icons/trash-2";

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

    // Move Cell Up
    moveCellUp: () => void;

    // Move Cell Down
    moveCellDown: () => void;

    // toDuplicate
    duplicateCell: () => void;
};

const cellDragDataKey = Symbol("notebook-cell");

/** Drag-and-drop data for a notebook cell.
 */
export type CellDragData = {
    [cellDragDataKey]: true;

    /** ID of the cell being dragged. */
    cellId: CellId;
};

/** Create drag-and-drop data for a notebook cell. */
const createCellDragData = (cellId: CellId) => ({
    [cellDragDataKey]: true,
    cellId,
});

/** Check whether the drag data is of notebook cell type. */
export function isCellDragData(data: Record<string | symbol, unknown>): data is CellDragData {
    return Boolean(data[cellDragDataKey]);
}

/** An individual cell in a notebook.

This component contains UI elements common to any cell. The actual content of
the cell is rendered by its children.
 */
export function NotebookCell(props: {
    cellId: CellId;
    actions: CellActions;
    children: JSX.Element;
    tag?: string;
}) {
    let rootRef!: HTMLDivElement;
    let handleRef!: HTMLButtonElement;

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
        {
            name: "Move Up",
            icon: <ArrowUp size={16} />,
            onComplete: props.actions.moveCellUp,
        },
        {
            name: "Move Down",
            icon: <ArrowDown size={16} />,
            onComplete: props.actions.moveCellDown,
        },
        {
            name: "Copy",
            icon: <Copy size={16} />,
            onComplete: props.actions.duplicateCell,
        },
    ];

    createEffect(() => {
        const cleanup = combine(
            draggable({
                element: handleRef,
                getInitialData: () => createCellDragData(props.cellId),
            }),
            dropTargetForElements({
                element: rootRef,
                canDrop({ source }) {
                    // TODO: Reject if cell belongs to a different notebook.
                    return isCellDragData(source.data);
                },
                getData({ input }) {
                    const data = createCellDragData(props.cellId);
                    return attachClosestEdge(data, {
                        element: rootRef,
                        input,
                        allowedEdges: ["top", "bottom"],
                    });
                },
            }),
        );
        onCleanup(cleanup);
    });

    return (
        <div class="cell" onMouseEnter={showGutter} onMouseLeave={hideGutter} ref={rootRef}>
            <div class="cell-gutter">
                <IconButton
                    onClick={props.actions.createBelow}
                    style={{ visibility: visibility(isGutterVisible()) }}
                    tooltip="Create a new cell below this one"
                >
                    <IconButton
                        onClick={props.actions.createAbove}
                        style={{ visibility: visibility(isGutterVisible()) }}
                        tooltip="Create a new cell above this one"
                    >
                        <ArrowUp />
                    </IconButton>

                    <IconButton
                        onClick={props.actions.moveCellDown}
                        style={{ visibility: visibility(isGutterVisible()) }}
                    >
                        <ArrowDown />
                    </IconButton>

                    <IconButton
                        onClick={props.actions.duplicateCell}
                        style={{ visibility: visibility(isGutterVisible()) }}
                    >
                        <Copy />
                    </IconButton>

                    <Plus />
                </IconButton>
                <Popover
                    open={isMenuOpen()}
                    onOpenChange={setMenuOpen}
                    floatingOptions={{
                        autoPlacement: {
                            allowedPlacements: ["left"],
                        },
                    }}
                >
                    <Popover.Anchor as="span">
                        <IconButton
                            onClick={openMenu}
                            style={{ visibility: visibility(isGutterVisible() || isMenuOpen()) }}
                            tooltip="Drag to move cell or click to open menu"
                            ref={handleRef}
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
