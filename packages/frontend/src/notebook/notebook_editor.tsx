import { getReorderDestinationIndex } from "@atlaskit/pragmatic-drag-and-drop-hitbox/util/get-reorder-destination-index";
import { monitorForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import type { DocHandle, Prop } from "@automerge/automerge-repo";
import Popover from "@corvu/popover";
import { makeEventListener } from "@solid-primitives/event-listener";
import ListPlus from "lucide-solid/icons/list-plus";
import {
    type Component,
    createEffect,
    createSignal,
    For,
    type JSX,
    Match,
    onCleanup,
    Show,
    Switch,
} from "solid-js";
import invariant from "tiny-invariant";

import { Nb } from "catcolab-document-methods";
import type { Cell, Notebook, RichTextContent, Uuid } from "catcolab-document-types";
import {
    type Completion,
    Completions,
    type CompletionsRef,
    type FocusHandle,
    IconButton,
    type KbdKey,
    keyEventHasModifier,
    type ModifierKey,
    useChildFocus,
} from "catcolab-ui-components";
import { materializeFromAutomerge } from "../util/materialize_from_automerge";
import {
    type CellActions,
    type CellComments,
    type CellDiffStatus,
    type CellDragData,
    type FormalCellEditorProps,
    isCellDragData,
    NotebookCell,
    RichTextCellEditor,
} from "./notebook_cell";

import "./notebook_editor.css";

/** Identifies which create-cell popover, if any, the editor wants open.

Either the id of an existing cell (open the "create below" popover anchored to
that cell) or `"append"` (open the popover for the end-of-notebook button).
 */
type CreatePopoverTarget = Uuid | "append" | null;

/** Constructor for a cell in a notebook.

A notebook knows how to edit cells, but without cell constructors, it wouldn't
know how to create them!
 */
export type CellConstructor<T> = {
    /** Name of cell constructor, usually naming the cell type. */
    name: string;

    /** Tooltip-length description of cell constructor. */
    description?: string;

    /** Keyboard shortcut to invoke the constructor. */
    shortcut?: KbdKey[];

    /** Called to construct a new cell. */
    construct: () => Cell<T>;
};

/** How a notebook differs from a baseline version of itself.

Computed by the host, which knows what the baseline is, and passed to the
notebook editor for display only.
 */
export type NotebookDiff<T> = {
    /** Cells that were added or changed since the baseline, by ID. */
    cells: Map<Uuid, Exclude<CellDiffStatus, "deleted">>;

    /** Baseline content of formal cells that changed, by ID, as plain values. */
    baseline: Map<Uuid, T>;

    /** Cells deleted since the baseline, in baseline order.

    Each is shown after the cell it followed in the baseline, or at the top of
    the notebook if `after` is `null`. The cell contents must be plain values,
    not live Automerge objects.
     */
    deleted: { cell: Cell<T>; after: Uuid | null }[];
};

/** Comments on the cells of a notebook.

Supplied by whatever hosts the notebook, which decides where comment threads
are stored and how they are shown.
 */
export type NotebookComments = {
    /** Number of open comment threads on a cell. */
    count: (cellId: Uuid) => number;

    /** Start a new comment thread on a cell. */
    add: (cellId: Uuid) => void;

    /** Render a cell's comment threads, shown in a popover beside the cell.

    The popover is not portalled, so events from the rendered threads bubble up
    through the notebook.
     */
    view: (cellId: Uuid) => JSX.Element;

    /** Called when the popover showing a cell's threads closes. */
    onClose?: (cellId: Uuid) => void;

    /** Whether a cell should be highlighted, such as while one of its threads
    is hovered elsewhere. */
    isHighlighted?: (cellId: Uuid) => boolean;

    /** Called when a cell gains or loses focus. */
    select?: (cellId: Uuid, selected: boolean) => void;
};

/** Notebook editor based on Automerge.

A notebook has two types of cells:

1. Rich text cells, with state managed by Automerge and ProseMirror
   independently of Solid's own state management
2. Formal content cells, with state inside a Solid Store connected to Automerge

Rich text cells are the same in all notebooks, whereas formal cells are handled
by custom components supplied to the notebook.
 */
export function NotebookEditor<T>(props: {
    handle: DocHandle<unknown>;
    path: Prop[];
    notebook: Notebook<T>;
    changeNotebook: (f: (nb: Notebook<T>) => void) => void;

    formalCellEditor: Component<FormalCellEditorProps<T>>;
    cellConstructors?: CellConstructor<T>[];
    cellLabel?: (content: T) => string | undefined;
    focus: FocusHandle;

    /** Called to duplicate an existing cell.

    If omitted, a deep copy is performed.
     */
    duplicateCell?: (content: T) => T;

    /** Differences from a baseline to highlight, if any. */
    diff?: NotebookDiff<T>;

    /** Comments on cells. If omitted, the notebook offers no comments. */
    comments?: NotebookComments;
}) {
    // oxlint-disable-next-line solid/reactivity -- Focus handles are stable for a mounted notebook.
    const cellFocus = useChildFocus<Uuid>(props.focus);
    const [currentDropTarget, setCurrentDropTarget] = createSignal<string | null>(null);

    // Which create-cell popover (if any) the editor has requested to open.
    // The popover itself is rendered by the cell (or end-of-notebook button) it
    // is anchored to, so positioning is automatic.
    const [createPopoverTarget, setCreatePopoverTarget] = createSignal<CreatePopoverTarget>(null);

    // cellOrder and cellContents can be briefly inconsistent.
    const cellOrder = () =>
        props.notebook.cellOrder.filter((cellId) => props.notebook.cellContents[cellId]);

    // Set up commands and their keyboard shortcuts.
    const insertCommands = (): Completion[] =>
        cellConstructors().map((cc) => {
            const { name, description, shortcut } = cc;
            return {
                name,
                description,
                shortcut: shortcut && [cellShortcutModifier, ...shortcut],
                onComplete: () => {
                    const activeCellId = cellFocus.activeChild();
                    const activeIndex = activeCellId ? cellOrder().indexOf(activeCellId) : -1;
                    const cellIndex =
                        activeIndex >= 0
                            ? Math.min(activeIndex + 1, cellOrder().length)
                            : cellOrder().length;
                    const newCell = cc.construct();
                    props.changeNotebook((nb) => {
                        Nb.insertCellAtIndex(nb, newCell, cellIndex);
                    });
                    // Defer so the popover fully closes before we focus the new cell.
                    requestAnimationFrame(() => cellFocus.setActiveChild(newCell.id));
                },
            };
        });

    const cellConstructors = (): CellConstructor<T>[] => [
        {
            name: "Text",
            description: "Start writing text",
            shortcut: ["T"],
            construct: () => Nb.newRichTextCell(),
        },
        ...(props.cellConstructors ?? []),
    ];

    /** Completions for creating a new cell below position `i`. */
    const createBelowCommands = (i: number): Completion[] =>
        cellConstructors().map((cc) => {
            const { name, description, shortcut } = cc;
            return {
                name,
                description,
                shortcut: shortcut && [cellShortcutModifier, ...shortcut],
                onComplete: () => {
                    const index = i + 1;
                    const newCell = cc.construct();
                    props.changeNotebook((nb) => {
                        Nb.insertCellAtIndex(nb, newCell, index);
                    });
                    // Defer so the popover fully closes before we focus the new cell.
                    requestAnimationFrame(() => cellFocus.setActiveChild(newCell.id));
                },
            };
        });

    /** Completions for appending a new cell at the end. */
    const appendCommands = (): Completion[] =>
        cellConstructors().map((cc) => {
            const { name, description, shortcut } = cc;
            return {
                name,
                description,
                shortcut: shortcut && [cellShortcutModifier, ...shortcut],
                onComplete: () => {
                    const newCell = cc.construct();
                    props.changeNotebook((nb) => {
                        Nb.appendCell(nb, newCell);
                    });
                    // Defer so the popover fully closes before we focus the new cell.
                    requestAnimationFrame(() => cellFocus.setActiveChild(newCell.id));
                },
            };
        });

    makeEventListener(window, "keydown", (evt) => {
        if (!props.focus.hasFocus()) {
            return;
        }
        if (keyEventHasModifier(evt, cellShortcutModifier)) {
            for (const command of insertCommands()) {
                const key = command.shortcut?.at(-1);
                if (key && evt.key.toUpperCase() === key) {
                    command.onComplete?.();
                    return evt.preventDefault();
                }
            }
        }
        if (
            (evt.shiftKey && evt.key === "Enter") ||
            (keyEventHasModifier(evt, cellShortcutModifier) && evt.key === "Enter")
        ) {
            // Capture the active cell *before* focus changes, then ask the
            // appropriate cell (or the end-of-notebook button) to open its
            // create-cell popover. The popover is rendered by that anchor, so
            // it is positioned automatically and doesn't require any DOM
            // queries here.
            const cellId = cellFocus.activeChild();
            setCreatePopoverTarget(cellId ?? "append");
            evt.preventDefault();
            // Stop the same event from reaching `CellTypePopover`'s window
            // keydown listener, which would otherwise see the popover as
            // already open and treat this Enter as confirming the first
            // completion (creating a rich-text cell immediately).
            evt.stopImmediatePropagation();
            return;
        }
    });

    // Set up drag and drop for notebook cells. Each cell reports to the
    // notebook whether it is the current drop target. Only the drop action is
    // handled here.
    createEffect(() => {
        const cleanup = monitorForElements({
            canMonitor({ source }) {
                return (
                    isCellDragData(source.data) &&
                    cellOrder().some((cellId) => cellId === source.data.cellId)
                );
            },
            onDrop({ location, source }) {
                const target =
                    location.current.dropTargets[0] ??
                    (currentDropTarget() ? { data: { cellId: currentDropTarget() } } : null);
                if (!(target && isCellDragData(source.data))) {
                    setCurrentDropTarget(null);
                    return;
                }
                const targetData = target.data as CellDragData;
                if (!targetData.cellId) {
                    setCurrentDropTarget(null);
                    return;
                }
                const [sourceId, targetId] = [source.data.cellId, targetData.cellId];
                const nb = props.notebook;
                const sourceIndex = nb.cellOrder.indexOf(sourceId);
                const targetIndex = nb.cellOrder.indexOf(targetId);
                if (sourceIndex < 0 || targetIndex < 0) {
                    setCurrentDropTarget(null);
                    return;
                }
                const finalIndex = getReorderDestinationIndex({
                    startIndex: sourceIndex,
                    indexOfTarget: targetIndex,
                    closestEdgeOfTarget: sourceIndex < targetIndex ? "bottom" : "top",
                    axis: "vertical",
                });
                props.changeNotebook((nb) => {
                    Nb.moveCellByIndex(nb, sourceIndex, finalIndex);
                });
                setCurrentDropTarget(null);
            },
        });
        onCleanup(cleanup);
    });

    const deletedCells = (after: Uuid | null) => (
        <For each={props.diff?.deleted.filter((deleted) => deleted.after === after)}>
            {(deleted) => (
                <DeletedNotebookCell
                    cell={deleted.cell}
                    formalCellEditor={props.formalCellEditor}
                    cellLabel={props.cellLabel}
                    focus={cellFocus.childFocus(deleted.cell.id)}
                />
            )}
        </For>
    );

    return (
        <div class="notebook">
            <Show when={cellOrder().length === 0}>
                <div class="notebook-cell-placeholder">
                    <CellTypePopover
                        completions={appendCommands()}
                        focus={props.focus}
                        open={createPopoverTarget() === "append"}
                        onOpenChange={(open) => setCreatePopoverTarget(open ? "append" : null)}
                    >
                        <ListPlus />
                    </CellTypePopover>
                    <span>Click button or press Shift-Enter to create a cell</span>
                </div>
            </Show>
            <ul class="notebook-cells">
                <Show when={props.diff}>
                    <li>{deletedCells(null)}</li>
                </Show>
                <For each={cellOrder()}>
                    {(cellId, i) => {
                        const focus = () => cellFocus.childFocus(cellId);

                        const cellActions: CellActions = {
                            activateAbove() {
                                if (i() > 0) {
                                    cellFocus.setActiveChild(cellOrder()[i() - 1] ?? null);
                                }
                            },
                            activateBelow() {
                                if (i() < Nb.numCells(props.notebook) - 1) {
                                    cellFocus.setActiveChild(cellOrder()[i() + 1] ?? null);
                                }
                            },
                            deleteBackward() {
                                const index = i();
                                const nextActiveId = cellOrder()[index - 1] ?? null;
                                props.changeNotebook((nb) => {
                                    Nb.deleteCellAtIndex(nb, index);
                                });
                                cellFocus.setActiveChild(nextActiveId);
                            },
                            deleteForward() {
                                const index = i();
                                const nextActiveId =
                                    cellOrder()[index + 1] ?? cellOrder()[index - 1] ?? null;
                                props.changeNotebook((nb) => {
                                    Nb.deleteCellAtIndex(nb, index);
                                });
                                cellFocus.setActiveChild(nextActiveId);
                            },
                            moveUp() {
                                // oxlint-disable-next-line solid/reactivity -- event handler
                                props.changeNotebook((nb) => {
                                    Nb.moveCellUp(nb, i());
                                });
                            },
                            moveDown() {
                                // oxlint-disable-next-line solid/reactivity -- event handler
                                props.changeNotebook((nb) => {
                                    Nb.moveCellDown(nb, i());
                                });
                            },
                        };

                        const cell = props.notebook.cellContents[cellId];
                        invariant(cell, `Failed to find contents for cell '${cellId}'`);

                        if (cell.tag !== "rich-text") {
                            // oxlint-disable-next-line solid/reactivity -- event handler
                            cellActions.duplicate = () => {
                                const index = i();
                                // Materialize the source cell out of Automerge
                                // before entering the change callback, so that
                                // `duplicateCell` (which uses `structuredClone`
                                // by default) operates on plain JS values.
                                const plainCell = materializeFromAutomerge(
                                    props.handle.doc(),
                                    cell,
                                );
                                const newCell = Nb.duplicateCell(plainCell, props.duplicateCell);
                                // oxlint-disable-next-line solid/reactivity -- event handler
                                props.changeNotebook((nb) => {
                                    Nb.insertCellAtIndex(nb, newCell, index + 1);
                                });
                                cellFocus.setActiveChild(newCell.id);
                            };
                        }

                        return (
                            <li>
                                <NotebookCell
                                    cellId={cell.id}
                                    index={i()}
                                    diff={props.diff?.cells.get(cellId)}
                                    comments={
                                        props.comments && cellComments(props.comments, cellId)
                                    }
                                    focus={focus()}
                                    actions={cellActions}
                                    tag={
                                        cell.tag === "formal"
                                            ? props.cellLabel?.(cell.content)
                                            : undefined
                                    }
                                    createCompletions={createBelowCommands(i())}
                                    popoverOpen={createPopoverTarget() === cellId}
                                    setPopoverOpen={(open) =>
                                        setCreatePopoverTarget(open ? cellId : null)
                                    }
                                    currentDropTarget={currentDropTarget()}
                                    setCurrentDropTarget={setCurrentDropTarget}
                                >
                                    <Switch>
                                        <Match when={cell.tag === "rich-text"}>
                                            <RichTextCellEditor
                                                cellId={cell.id}
                                                handle={props.handle}
                                                path={[...props.path, "cellContents", cell.id]}
                                                focus={focus()}
                                                actions={cellActions}
                                            />
                                        </Match>
                                        <Match when={cell.tag === "formal" ? cell : undefined}>
                                            {(formalCell) => (
                                                <props.formalCellEditor
                                                    content={formalCell().content}
                                                    baseline={props.diff?.baseline.get(cell.id)}
                                                    changeContent={(f) =>
                                                        props.changeNotebook((nb) =>
                                                            Nb.mutateCellContentById(
                                                                nb,
                                                                cell.id,
                                                                f,
                                                            ),
                                                        )
                                                    }
                                                    focus={focus()}
                                                    actions={cellActions}
                                                />
                                            )}
                                        </Match>
                                    </Switch>
                                </NotebookCell>
                                {deletedCells(cellId)}
                            </li>
                        );
                    }}
                </For>
            </ul>
            <Show when={cellOrder().length > 0}>
                <div class="notebook-cell-placeholder">
                    <CellTypePopover
                        completions={appendCommands()}
                        focus={props.focus}
                        tooltip="Create a new cell"
                        open={createPopoverTarget() === "append"}
                        onOpenChange={(open) => setCreatePopoverTarget(open ? "append" : null)}
                    >
                        <ListPlus />
                    </CellTypePopover>
                </div>
            </Show>
        </div>
    );
}

/** A cell that no longer exists in the notebook, shown as a read-only ghost.

The cell isn't in the live document, so a formal cell is rendered by the usual
cell editor with changes discarded, and a rich text cell as plain text.
 */
function DeletedNotebookCell<T>(props: {
    cell: Cell<T>;
    formalCellEditor: Component<FormalCellEditorProps<T>>;
    cellLabel?: (content: T) => string | undefined;
    focus: FocusHandle;
}) {
    const formalCell = () => (props.cell.tag === "formal" ? props.cell : undefined);
    const richTextCell = () => (props.cell.tag === "rich-text" ? props.cell : undefined);

    const tag = () => {
        const cell = formalCell();
        return cell && props.cellLabel?.(cell.content);
    };

    return (
        <div class="cell" data-diff="deleted" inert>
            <div class="cell-content">
                <Switch>
                    <Match when={richTextCell()}>
                        {(cell) => (
                            <p class="deleted-rich-text">{richTextToString(cell().content)}</p>
                        )}
                    </Match>
                    <Match when={formalCell()}>
                        {(cell) => (
                            <props.formalCellEditor
                                content={cell().content}
                                changeContent={() => {}}
                                focus={props.focus}
                                actions={deletedCellActions}
                            />
                        )}
                    </Match>
                </Switch>
            </div>
            <Show when={tag()}>
                <div class="cell-tag">{tag()}</div>
            </Show>
        </div>
    );
}

const deletedCellActions: CellActions = {
    activateAbove() {},
    activateBelow() {},
    deleteBackward() {},
    deleteForward() {},
    moveUp() {},
    moveDown() {},
};

/** Binds a notebook's comments to one of its cells. */
function cellComments(comments: NotebookComments, cellId: Uuid): CellComments {
    return {
        get count() {
            return comments.count(cellId);
        },
        add: () => comments.add(cellId),
        view: () => comments.view(cellId),
        onClose: () => comments.onClose?.(cellId),
        get isHighlighted() {
            return comments.isHighlighted?.(cellId) ?? false;
        },
        select: (selected) => comments.select?.(cellId, selected),
    };
}

/** Flattens rich text to plain text, with blocks as line breaks. */
function richTextToString(content: RichTextContent): string {
    if (typeof content === "string") {
        return content.replaceAll("\uFFFC", "\n").trim();
    }
    return content
        .map((span) => (span.type === "text" ? span.value : "\n"))
        .join("")
        .trim();
}

/** A button that opens a popover with cell type completions.

The open state can either be managed internally (default) or controlled by the
parent via the `open` and `onOpenChange` props. When the popover is open, this
component handles keyboard navigation of the completions list (Arrow
Up/Down to move, Enter to select, Escape to close).
 */
export function CellTypePopover(props: {
    completions: Completion[];
    focus?: FocusHandle;
    tooltip?: string;
    /** Whether the button is visible. Defaults to `true`. The button always
        remains visible while the popover is open. */
    showButton?: boolean;
    /** Controlled open state. If omitted, the popover manages its own state. */
    open?: boolean;
    /** Called when the open state should change. */
    onOpenChange?: (open: boolean) => void;
    children: JSX.Element;
}) {
    const [internalOpen, setInternalOpen] = createSignal(false);
    const isOpen = () => props.open ?? internalOpen();
    const setIsOpen = (open: boolean) => {
        setInternalOpen(open);
        props.onOpenChange?.(open);
    };

    const [completionsRef, setCompletionsRef] = createSignal<CompletionsRef>();

    // While open, take over the relevant keys for keyboard navigation. We
    // listen on the window because focus may be elsewhere (e.g. the cell
    // editor that triggered Shift-Enter).
    makeEventListener(window, "keydown", (evt) => {
        if (!isOpen()) {
            return;
        }
        if (props.focus && !props.focus.hasFocus()) {
            return;
        }
        const ref = completionsRef();
        if (evt.key === "ArrowDown") {
            ref?.nextPresumptive();
            return evt.preventDefault();
        }
        if (evt.key === "ArrowUp") {
            ref?.previousPresumptive();
            return evt.preventDefault();
        }
        if (evt.key === "Enter") {
            ref?.selectPresumptive();
            return evt.preventDefault();
        }
        if (evt.key === "Escape") {
            setIsOpen(false);
            return evt.preventDefault();
        }
    });

    return (
        <Popover
            open={isOpen()}
            onOpenChange={setIsOpen}
            placement="bottom-start"
            floatingOptions={{ flip: true }}
            restoreFocus={false}
        >
            <Popover.Anchor as="span">
                <IconButton
                    onClick={() => setIsOpen(true)}
                    tooltip={props.tooltip}
                    style={{
                        visibility: (props.showButton ?? true) || isOpen() ? "visible" : "hidden",
                    }}
                >
                    {props.children}
                </IconButton>
            </Popover.Anchor>
            <Popover.Portal>
                <Popover.Content class="popup">
                    <Completions
                        completions={props.completions}
                        ref={setCompletionsRef}
                        onComplete={() => setIsOpen(false)}
                    />
                </Popover.Content>
            </Popover.Portal>
        </Popover>
    );
}

/** Modifier key to use in keyboard shortcuts for cell constructors.

The choice is platform-specific: On Mac, the Alt/Option key remaps keys, so we
use Control, whereas on other platforms Control tends to be already bound in
other shortcuts, so we Alt.
 */
const cellShortcutModifier: ModifierKey = navigator.userAgent.includes("Mac") ? "Control" : "Alt";
