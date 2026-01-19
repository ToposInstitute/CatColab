import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import {
    draggable,
    dropTargetForElements,
} from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { preventUnhandled } from "@atlaskit/pragmatic-drag-and-drop/prevent-unhandled";
import { attachClosestEdge } from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge";
import type { DocHandle, Prop } from "@automerge/automerge-repo";
import Popover from "@corvu/popover";
import ArrowDown from "lucide-solid/icons/arrow-down";
import ArrowUp from "lucide-solid/icons/arrow-up";
import Copy from "lucide-solid/icons/copy";
import GripVertical from "lucide-solid/icons/grip-vertical";
import Plus from "lucide-solid/icons/plus";
import Trash2 from "lucide-solid/icons/trash-2";
import type { EditorView } from "prosemirror-view";
import { createEffect, createSignal, type JSX, onCleanup, Show } from "solid-js";

import { type Completion, Completions, IconButton, InlineInput } from "catcolab-ui-components";
import type { Uuid } from "catlog-wasm";
import { RichTextEditor } from "../components";

import "./notebook_cell.css";

/** Props available to all notebook cell editors. */
export type CellEditorProps = {
    /** Is the cell requested to be active?

    When this prop changes to `true`, the cell is authorizeed to grab the focus.
     */
    isActive: boolean;

    /** Actions invokable within the cell. */
    actions: CellActions;
};

/** Actions invokable *within* a cell but affecting the overall notebook state.

Using these functions, a cell can request to perform an action on the notebook
such as deleting or moving itself.
*/
export type CellActions = {
    /** Activate the cell above this one. */
    activateAbove: () => void;

    /** Activate the cell below this one. */
    activateBelow: () => void;

    /** Create a new stem cell above this one. */
    createAbove: () => void;

    /** Create a new stem cell below this one. */
    createBelow: () => void;

    /** Delete this cell in the backward/upward direction. */
    deleteBackward: () => void;

    /** Delete this cell in the forward/downward direction. */
    deleteForward: () => void;

    /** Duplicate this cell, adding the new cell below this one. */
    duplicate?: () => void;

    /** Move this cell up, if possible. */
    moveUp: () => void;

    /** Move this cell down, if possible. */
    moveDown: () => void;

    /** The cell has received focus. */
    hasFocused: () => void;
};

const cellDragDataKey = Symbol("notebook-cell");

/** Drag-and-drop data for a notebook cell.
 */
export type CellDragData = {
    [cellDragDataKey]: true;

    /** ID of the cell being dragged. */
    cellId: Uuid;
};

/** Create drag-and-drop data for a notebook cell. */
const createCellDragData = (cellId: Uuid, index: number) => ({
    [cellDragDataKey]: true,
    cellId,
    index,
});

/** Check whether the drag data is of notebook cell type. */
export function isCellDragData(data: Record<string | symbol, unknown>): data is CellDragData {
    return Boolean(data[cellDragDataKey]);
}

type ClosestEdge = "top" | "bottom" | null;

/** Diff type for cell annotations. */
export type CellDiffType = "added" | "changed" | "deleted" | undefined;

/** An individual cell in a notebook.

This component contains UI elements common to any cell. The actual content of
the cell is rendered by its children.
 */
export function NotebookCell(props: {
    cellId: Uuid;
    index: number;
    actions: CellActions;
    children: JSX.Element;
    tag?: string;
    currentDropTarget: string | null;
    setCurrentDropTarget: (cellId: string | null) => void;
    /** Optional diff type for highlighting changes. */
    diffType?: CellDiffType;
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
        ...(props.actions.duplicate
            ? [
                  {
                      name: "Duplicate",
                      icon: <Copy size={16} />,
                      onComplete: props.actions.duplicate,
                  },
              ]
            : []),
        {
            name: "Move Up",
            icon: <ArrowUp size={16} />,
            onComplete: props.actions.moveUp,
        },
        {
            name: "Move Down",
            icon: <ArrowDown size={16} />,
            onComplete: props.actions.moveDown,
        },
    ];

    const [closestEdge, setClosestEdge] = createSignal<ClosestEdge>(null);
    const [dropTarget, setDropTarget] = createSignal(false);
    const [isDragging, setIsDragging] = createSignal(false);

    const isActiveDropTarget = () => props.currentDropTarget === props.cellId;
    createEffect(() => {
        if (!isActiveDropTarget()) {
            setClosestEdge(null);
            setDropTarget(false);
        }
    });

    createEffect(() => {
        const cleanup = combine(
            draggable({
                element: handleRef,
                getInitialData: () => createCellDragData(props.cellId, props.index),
                onGenerateDragPreview({ nativeSetDragImage }) {
                    if (nativeSetDragImage) {
                        // Clone the cell content for the drag preview
                        const cellContent = rootRef.querySelector(".cell-content");
                        if (cellContent) {
                            const preview = cellContent.cloneNode(true) as HTMLElement;
                            preview.style.width = `${cellContent.clientWidth}px`;
                            preview.style.opacity = "0.8";
                            preview.style.pointerEvents = "none";
                            document.body.appendChild(preview);
                            nativeSetDragImage(preview, 0, 0);

                            setTimeout(() => {
                                preview.remove();
                            }, 0);
                        }
                    }
                },
                onDragStart() {
                    setIsDragging(true);
                    preventUnhandled.start();
                },
                onDrop() {
                    setIsDragging(false);
                    preventUnhandled.stop();
                },
            }),
            dropTargetForElements({
                element: rootRef,
                canDrop({ source }) {
                    // TODO: Reject if cell belongs to a different notebook.
                    return isCellDragData(source.data);
                },
                getData({ input }) {
                    const data = createCellDragData(props.cellId, props.index);
                    return attachClosestEdge(data, {
                        element: rootRef,
                        input,
                        allowedEdges: ["top", "bottom"],
                    });
                },
                onDragEnter(args) {
                    const sourceIndex = args.source.data.index as number;
                    const targetIndex = args.self.data.index as number;

                    props.setCurrentDropTarget(props.cellId);
                    const edge = sourceIndex < targetIndex ? "bottom" : "top";
                    setClosestEdge(edge);
                    setDropTarget(true);
                },
                onDrop() {
                    setDropTarget(false);
                    setClosestEdge(null);
                },
            }),
        );
        onCleanup(cleanup);
    });

    return (
        <div
            class="cell"
            classList={{
                "cell-dragging": isDragging(),
                "cell-diff-added": props.diffType === "added",
                "cell-diff-changed": props.diffType === "changed",
                "cell-diff-deleted": props.diffType === "deleted",
            }}
            onMouseEnter={showGutter}
            onMouseLeave={hideGutter}
            ref={rootRef}
        >
            <div class="cell-gutter">
                <IconButton
                    onClick={props.actions.createBelow}
                    style={{ visibility: visibility(isGutterVisible()) }}
                    tooltip="Create a new cell below this one"
                >
                    <Plus />
                </IconButton>
                <Popover
                    open={isMenuOpen()}
                    onOpenChange={setMenuOpen}
                    placement="left"
                    floatingOptions={{
                        flip: true,
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
            <div class="cell-content">
                <Show when={dropTarget() && closestEdge() === "top"}>
                    <div class="drop-indicator-with-dots" />
                </Show>
                {props.children}
                <Show when={dropTarget() && closestEdge() === "bottom"}>
                    <div class="drop-indicator-with-dots" />
                </Show>
            </div>
            <Show when={props.tag}>
                <div class="cell-tag">{props.tag}</div>
            </Show>
        </div>
    );
}

/** Editor for rich text cells, a simple wrapper around `RichTextEditor`.
 */
export function RichTextCellEditor(
    props: CellEditorProps & {
        cellId: Uuid;
        handle: DocHandle<unknown>;
        path: Prop[];
    },
) {
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
export function StemCellEditor(
    props: CellEditorProps & {
        completions: Completion[];
    },
) {
    const [text, setText] = createSignal("");

    return (
        <InlineInput
            text={text()}
            setText={setText}
            placeholder="Select cell type"
            completions={props.completions}
            showCompletionsOnFocus={true}
            isActive={props.isActive}
            deleteBackward={props.actions.deleteBackward}
            deleteForward={props.actions.deleteForward}
            exitUp={props.actions.activateAbove}
            exitDown={props.actions.activateBelow}
            hasFocused={props.actions.hasFocused}
        />
    );
}

/** Interface for editors of cells with formal content.
 */
export type FormalCellEditorProps<T> = CellEditorProps & {
    content: T;
    changeContent: (f: (content: T) => void) => void;
};
